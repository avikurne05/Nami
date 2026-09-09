import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../firebase/config';
import { RideSession, RideHistoryEntry, CompletedRideMaster } from '../types';
import { generateRoomCode } from '../utils';
import { sanitizeForFirestore, validateAndSanitizeRidePayload } from '../utils/firestoreSanitizer';
import { generateNamiJoinToken, generateNamiQRPayload, parseNamiQRPayload } from '../utils/qrCodeGenerator';

// Configurable inactivity timeout (default 24 hours)
export const RIDE_EXPIRATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const LOCAL_HISTORY_STORAGE_PREFIX = '@nami_ride_history_';

async function saveToLocalHistory(userId: string, entry: RideHistoryEntry): Promise<void> {
  if (!userId || !entry) return;
  try {
    const key = `${LOCAL_HISTORY_STORAGE_PREFIX}${userId}`;
    const raw = await AsyncStorage.getItem(key);
    const list: RideHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const existsIdx = list.findIndex(
      (h) => h.id === entry.id || (entry.rideId && h.rideId === entry.rideId)
    );
    if (existsIdx >= 0) {
      list[existsIdx] = { ...list[existsIdx], ...entry };
    } else {
      list.unshift(entry);
    }
    await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch (e) {
    console.warn('saveToLocalHistory failed:', e);
  }
}

async function getFromLocalHistory(userId: string): Promise<RideHistoryEntry[]> {
  if (!userId) return [];
  try {
    const key = `${LOCAL_HISTORY_STORAGE_PREFIX}${userId}`;
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('getFromLocalHistory failed:', e);
    return [];
  }
}

async function removeFromLocalHistory(userId: string, historyId: string, rideId?: string): Promise<void> {
  if (!userId || !historyId) return;
  try {
    const key = `${LOCAL_HISTORY_STORAGE_PREFIX}${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const list: RideHistoryEntry[] = JSON.parse(raw);
    const filtered = list.filter((h) => h.id !== historyId && (!rideId || h.rideId !== rideId));
    await AsyncStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    console.warn('removeFromLocalHistory failed:', e);
  }
}

async function clearLocalHistory(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const key = `${LOCAL_HISTORY_STORAGE_PREFIX}${userId}`;
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('clearLocalHistory failed:', e);
  }
}

export const RideService = {
  /**
   * Create a new ride session and return the document ID
   */
  async createRide(
    leaderId: string,
    leaderName: string,
    rideName: string,
    destinationName: string,
    destinationLat: number,
    destinationLon: number,
    maxGap: number = 500,
    visibility: 'private' | 'public' = 'private'
  ): Promise<string> {
    const roomCode = generateRoomCode();
    const rideRef = doc(collection(db, 'rides'));
    const now = Date.now();
    const joinToken = generateNamiJoinToken();
    const qrPayload = generateNamiQRPayload(rideRef.id, roomCode, leaderId, joinToken);

    const newRide: RideSession = {
      id: rideRef.id,
      name: (rideName || 'Group Ride').trim(),
      destination: {
        name: (destinationName || 'Destination').trim(),
        latitude: destinationLat || 0,
        longitude: destinationLon || 0,
      },
      maxGap: maxGap || 500,
      visibility: visibility || 'private',
      roomCode,
      leaderId: leaderId || 'unknown',
      leaderName: (leaderName || 'Leader').trim(),
      status: 'lobby',
      createdAt: now,
      lastActivityAt: now,
      members: [leaderId].filter(Boolean),
      joinToken,
      qrPayload,
    };

    await setDoc(rideRef, sanitizeForFirestore(newRide as unknown as Record<string, unknown>));
    return rideRef.id;
  },

  /**
   * Bump activity timestamp on a ride session
   */
  async updateRideActivity(rideId: string): Promise<void> {
    if (!rideId) return;
    try {
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        lastActivityAt: Date.now(),
      });
    } catch (e) {
      // Quiet fallback
    }
  },

  /**
   * Join or re-enter an active ride session using a 6-character room code
   */
  async joinRide(roomCode: string, userId: string): Promise<string> {
    const ridesRef = collection(db, 'rides');
    const q = query(
      ridesRef,
      where('roomCode', '==', roomCode.toUpperCase().trim())
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('No ride found with this room code.');
    }

    const rideDoc = querySnapshot.docs[0];
    const rideData = rideDoc.data() as RideSession;

    if (rideData.status === 'completed' || rideData.status === 'cancelled') {
      throw new Error('This ride session has already ended or expired.');
    }

    // Check if ride has expired due to 24h inactivity
    const lastActive = rideData.lastActivityAt || rideData.createdAt;
    if (Date.now() - lastActive > RIDE_EXPIRATION_TIMEOUT_MS) {
      await this.expireRide(rideDoc.id, 'auto_expired');
      throw new Error('This ride session has automatically expired due to 24h inactivity.');
    }

    if (rideData.members.includes(userId)) {
      return rideDoc.id; // Already a member, re-enter session
    }

    // Add member to the members list & bump activity
    await updateDoc(doc(db, 'rides', rideDoc.id), {
      members: arrayUnion(userId),
      lastActivityAt: Date.now(),
    });

    return rideDoc.id;
  },

  /**
   * Validates a scanned QR payload or room code with primary `rideId` resolution,
   * mismatch detection, cryptographic joinToken verification, and network distinction.
   */
  async validateAndJoinRide(
    rawPayload: string,
    userId: string
  ): Promise<{
    success: boolean;
    rideId?: string;
    status?: string;
    errorCode?: 'OFFLINE' | 'INVALID_TOKEN' | 'NOT_FOUND' | 'EXPIRED';
    errorMessage?: string;
  }> {
    console.log('[QR] Scanned payload:', rawPayload);

    const parsed = parseNamiQRPayload(rawPayload);
    if (!parsed || (!parsed.roomCode && !parsed.rideId)) {
      console.warn('[QR] Failed to parse QR payload');
      return {
        success: false,
        errorCode: 'INVALID_TOKEN',
        errorMessage: 'Invalid Biker Radar QR Code',
      };
    }

    console.log('[QR] Parsed rideId:', parsed.rideId || 'None (Legacy QR)');
    console.log('[QR] Parsed roomCode:', parsed.roomCode);

    try {
      let rideData: RideSession | null = null;
      let targetRideId: string = '';

      // ── PRIMARY IDENTIFIER: Use rideId if encoded in QR payload ──
      if (parsed.rideId) {
        const rideRef = doc(db, 'rides', parsed.rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) {
          console.warn('[QR] Ride document not found by rideId:', parsed.rideId);
          return {
            success: false,
            errorCode: 'NOT_FOUND',
            errorMessage: 'Ride Not Found',
          };
        }

        rideData = { id: rideSnap.id, ...rideSnap.data() } as RideSession;
        targetRideId = rideSnap.id;

        // PREVENT ROOM/QR MISMATCH: Verify roomCode & rideId match Firestore document
        if (parsed.roomCode && rideData.roomCode && parsed.roomCode !== rideData.roomCode) {
          console.warn('[QR] Room code mismatch! QR roomCode:', parsed.roomCode, 'Firestore roomCode:', rideData.roomCode);
          return {
            success: false,
            errorCode: 'INVALID_TOKEN',
            errorMessage: 'QR information does not match this ride.',
          };
        }

        if (rideData.id !== parsed.rideId) {
          console.warn('[QR] Ride ID mismatch!');
          return {
            success: false,
            errorCode: 'INVALID_TOKEN',
            errorMessage: 'Invalid Ride QR',
          };
        }
      } else {
        // ── LEGACY QR FALLBACK: Query by roomCode ──
        console.log('[QR] Searching by roomCode query:', parsed.roomCode);
        const ridesRef = collection(db, 'rides');
        const q = query(ridesRef, where('roomCode', '==', parsed.roomCode));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          console.warn('[QR] No ride found with roomCode:', parsed.roomCode);
          return {
            success: false,
            errorCode: 'NOT_FOUND',
            errorMessage: 'Ride Not Found',
          };
        }

        const foundDoc = querySnapshot.docs[0];
        targetRideId = foundDoc.id;
        rideData = { id: foundDoc.id, ...foundDoc.data() } as RideSession;
      }

      if (!rideData) {
        return {
          success: false,
          errorCode: 'NOT_FOUND',
          errorMessage: 'Ride Not Found',
        };
      }

      console.log('[QR] Firestore ride found:', targetRideId, 'Status:', rideData.status);

      // 1. Status & Expiration Check
      if (rideData.status === 'completed' || rideData.status === 'cancelled' || rideData.status === 'ended') {
        return {
          success: false,
          errorCode: 'EXPIRED',
          errorMessage: 'Ride Expired or Ended',
        };
      }

      const lastActive = rideData.lastActivityAt || rideData.createdAt;
      if (Date.now() - lastActive > RIDE_EXPIRATION_TIMEOUT_MS) {
        await this.expireRide(targetRideId, 'auto_expired');
        return {
          success: false,
          errorCode: 'EXPIRED',
          errorMessage: 'Ride Expired due to inactivity',
        };
      }

      // 2. Cryptographic joinToken Verification (if payload contains token)
      if (parsed.joinToken && rideData.joinToken && parsed.joinToken !== rideData.joinToken) {
        console.warn('[QR] Join token mismatch or revoked');
        return {
          success: false,
          errorCode: 'INVALID_TOKEN',
          errorMessage: 'Invalid or Revoked QR Code',
        };
      }

      // 3. Join Ride Session in Firestore
      console.log('[QR] Joining ride:', targetRideId, 'for userId:', userId);
      if (userId && !rideData.members.includes(userId)) {
        await updateDoc(doc(db, 'rides', targetRideId), {
          members: arrayUnion(userId),
          lastActivityAt: Date.now(),
        });
      }

      console.log('[QR] Navigation target:', targetRideId, 'Status:', rideData.status);

      return {
        success: true,
        rideId: targetRideId,
        status: rideData.status,
      };
    } catch (e: any) {
      console.warn('[QR] validateAndJoinRide error:', e);
      const isNetworkError =
        e?.message?.includes('network') ||
        e?.message?.includes('offline') ||
        e?.code === 'unavailable' ||
        e?.name === 'FirebaseError';

      if (isNetworkError) {
        return {
          success: false,
          errorCode: 'OFFLINE',
          errorMessage: 'No Internet Connection. Reconnect to verify ride.',
        };
      }

      return {
        success: false,
        errorCode: 'NOT_FOUND',
        errorMessage: e?.message || 'Could not verify ride.',
      };
    }
  },

  /**
   * Check if a user is currently part of an active/ongoing ride session.
   * Auto-expires abandoned rides (>24h inactivity) or empty rides immediately.
   */
  async getActiveRideForUser(userId: string): Promise<RideSession | null> {
    if (!userId) return null;
    try {
      const ridesRef = collection(db, 'rides');
      const q = query(ridesRef, where('members', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return null;

      const now = Date.now();
      const activeRides = querySnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RideSession))
        .filter((r) => r && (r.status === 'lobby' || r.status === 'active'));

      if (activeRides.length === 0) return null;

      const currentRide = activeRides[0];
      const lastActive = currentRide.lastActivityAt || currentRide.createdAt;

      // Smart Expiration Check 1: Inactive > 24 hours
      if (now - lastActive > RIDE_EXPIRATION_TIMEOUT_MS) {
        await this.expireRide(currentRide.id, 'auto_expired');
        return null;
      }

      // Smart Expiration Check 2: All participants left
      if (!currentRide.members || currentRide.members.length === 0) {
        await this.expireRide(currentRide.id, 'all_left');
        return null;
      }

      return currentRide;
    } catch (e) {
      console.warn('getActiveRideForUser failed:', e);
      return null;
    }
  },

  /**
   * Subscribe to real-time updates for a user's current active ride session
   */
  subscribeToActiveRideForUser(
    userId: string,
    callback: (ride: RideSession | null) => void
  ) {
    if (!userId) {
      callback(null);
      return () => {};
    }

    const ridesRef = collection(db, 'rides');
    const q = query(ridesRef, where('members', 'array-contains', userId));

    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          callback(null);
          return;
        }

        const activeRides = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RideSession))
          .filter(
            (r) =>
              r &&
              Array.isArray(r.members) &&
              r.members.includes(userId) &&
              (r.status === 'lobby' || r.status === 'active')
          );

        if (activeRides.length > 0) {
          const currentRide = activeRides[0];
          const lastActive = currentRide.lastActivityAt || currentRide.createdAt;
          if (Date.now() - lastActive > RIDE_EXPIRATION_TIMEOUT_MS) {
            this.expireRide(currentRide.id, 'auto_expired').catch(() => {});
            callback(null);
          } else {
            callback(currentRide);
          }
        } else {
          callback(null);
        }
      },
      (error) => {
        console.warn('subscribeToActiveRideForUser error:', error);
        callback(null);
      }
    );
  },

  /**
   * Leave a ride session. Immediate completion if all participants leave.
   */
  async leaveRide(rideId: string, userId: string): Promise<void> {
    if (!rideId || !userId) return;
    const rideRef = doc(db, 'rides', rideId);
    const rideSnap = await getDoc(rideRef);
    if (!rideSnap.exists()) return;

    const rideData = rideSnap.data() as RideSession;
    const updatedMembers = (rideData.members || []).filter((id) => id !== userId);

    if (updatedMembers.length === 0) {
      await this.expireRide(rideId, 'all_left');
    } else {
      await updateDoc(rideRef, {
        members: arrayRemove(userId),
        lastActivityAt: Date.now(),
      });
    }
  },

  /**
   * Cancel a ride session (only leader should call this). Immediate completion.
   */
  async cancelRide(rideId: string): Promise<void> {
    if (!rideId) return;
    await this.expireRide(rideId, 'leader_ended');
  },

  /**
   * Subscribe to real-time updates for a single ride
   */
  subscribeToRide(rideId: string, callback: (ride: RideSession | null) => void) {
    const rideRef = doc(db, 'rides', rideId);
    return onSnapshot(
      rideRef,
      (docSnap) => {
        if (docSnap.exists()) {
          callback({ id: docSnap.id, ...docSnap.data() } as RideSession);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('Error listening to ride session:', error);
        callback(null);
      }
    );
  },

  /**
   * Start the ride (only leader should call this)
   */
  async startRide(rideId: string): Promise<void> {
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      status: 'active',
      lastActivityAt: Date.now(),
    });
  },

  /**
   * End the ride (manual or auto-expired) and write dual-layer records:
   * 1. Master immutable record in `completed_rides/{rideId}`
   * 2. Per-user independent entries in `users/{userId}/ride_history/{rideId}` and top-level `ride_history`
   */
  async endRide(
    rideId: string,
    duration: number,
    totalDistance: number,
    averageSpeed: number,
    topSpeed: number
  ): Promise<RideHistoryEntry> {
    return this.persistRideHistory(rideId, duration, totalDistance, averageSpeed, topSpeed, 'manual');
  },

  /**
   * Expire or auto-complete an inactive/empty ride
   */
  async expireRide(
    rideId: string,
    reason: 'manual' | 'leader_ended' | 'auto_expired' | 'all_left' = 'auto_expired'
  ): Promise<RideHistoryEntry> {
    return this.persistRideHistory(rideId, 0, 0, 0, 0, reason);
  },

  /**
   * Internal dual-layer persistence method
   */
  async persistRideHistory(
    rideId: string,
    duration: number,
    totalDistance: number,
    averageSpeed: number,
    topSpeed: number,
    completedReason: 'manual' | 'leader_ended' | 'auto_expired' | 'all_left'
  ): Promise<RideHistoryEntry> {
    const rideRef = doc(db, 'rides', rideId);
    const rideSnap = await getDoc(rideRef);
    const now = Date.now();

    if (!rideSnap.exists()) {
      throw new Error('Ride session not found.');
    }

    const rawData = { id: rideSnap.id, ...rideSnap.data() } as any;

    // Validate and sanitize the payload
    const { sanitized: rideData } = validateAndSanitizeRidePayload(rawData);

    // Update ride status to completed
    await updateDoc(rideRef, {
      status: 'completed',
      lastActivityAt: now,
    });

    const membersList: string[] = Array.isArray(rideData.members) && rideData.members.length > 0
      ? rideData.members
      : [rideData.leaderId || 'unknown'];

    const totalDur = duration || Math.max(0, Math.floor((now - (rideData.createdAt || now)) / 1000));
    const destName = rideData.destination?.name || 'Destination';
    const rideName = rideData.name || 'Group Ride';
    const leaderName = rideData.leaderName || 'Rider';

    // 1. Write Master Shared Record in `completed_rides/{rideId}`
    const masterRef = doc(db, 'completed_rides', rideId);
    const masterRecord: CompletedRideMaster = {
      id: rideId,
      rideId,
      name: rideName,
      leaderId: rideData.leaderId || 'unknown',
      leaderName: leaderName,
      destination: rideData.destination,
      startLocation: rideData.startLocation,
      startTime: rideData.createdAt || now,
      endTime: now,
      totalDuration: totalDur,
      members: membersList,
      membersCount: membersList.length,
      completedReason,
    };

    const sanitizedMaster = sanitizeForFirestore(masterRecord);
    try {
      await setDoc(masterRef, sanitizedMaster);
    } catch (masterErr) {
      console.warn('Failed writing completed_rides master record:', masterErr);
    }

    // 2. Write Per-User Standalone Entries for ALL members
    const primaryHistoryRef = doc(collection(db, 'ride_history'));
    const historyId = primaryHistoryRef.id;
    const historyEntry: RideHistoryEntry = {
      id: historyId,
      rideId,
      name: rideName,
      leaderName: leaderName,
      destinationName: destName,
      duration: totalDur,
      totalDistance: totalDistance || 0,
      averageSpeed: averageSpeed || 0,
      topSpeed: topSpeed || 0,
      membersCount: membersList.length,
      startTime: rideData.createdAt || now,
      endTime: now,
      memberUids: membersList,
    };

    const sanitizedHistory = sanitizeForFirestore(historyEntry);

    // Save immediately to local storage for all members for 0ms retrieval
    for (const uid of membersList) {
      if (uid) {
        saveToLocalHistory(uid, sanitizedHistory).catch(() => {});
      }
    }

    try {
      const batch = writeBatch(db);
      batch.set(primaryHistoryRef, sanitizedHistory);

      membersList.forEach((uid) => {
        if (uid) {
          const userHistRef = doc(db, 'users', uid, 'ride_history', historyId);
          batch.set(userHistRef, sanitizedHistory);
        }
      });

      await batch.commit();
    } catch (batchErr) {
      console.warn('Batch write failed, trying individual fallback sets:', batchErr);
      try {
        await setDoc(primaryHistoryRef, sanitizedHistory);
      } catch (e) {}

      for (const uid of membersList) {
        if (uid) {
          try {
            const userHistRef = doc(db, 'users', uid, 'ride_history', historyId);
            await setDoc(userHistRef, sanitizedHistory);
          } catch (e) {}
        }
      }
    }

    return sanitizedHistory;
  },

  /**
   * Retrieve ride history for a user (combines instant local cache, user subcollection, and top-level collection)
   */
  async getRideHistory(userId: string): Promise<RideHistoryEntry[]> {
    if (!userId) return [];
    try {
      const historyMap: { [id: string]: RideHistoryEntry } = {};

      // 1. Instant load from local AsyncStorage
      const localEntries = await getFromLocalHistory(userId);
      localEntries.forEach((entry) => {
        if (entry && (entry.id || entry.rideId)) {
          const key = entry.id || entry.rideId;
          historyMap[key] = entry;
        }
      });

      // 2. Fetch user-specific subcollection history from Firestore
      try {
        const userHistRef = collection(db, 'users', userId, 'ride_history');
        const userSnap = await getDocs(userHistRef);
        userSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id;
          const entry = { ...data, id: docId } as RideHistoryEntry;
          historyMap[docId] = entry;
          if (entry.rideId) historyMap[entry.rideId] = entry;
        });
      } catch (subErr) {
        console.warn('Could not read user subcollection ride_history:', subErr);
      }

      // 3. Fetch top-level history for backward compatibility
      try {
        const historyRef = collection(db, 'ride_history');
        const q = query(historyRef, where('memberUids', 'array-contains', userId));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id;
          const entry = { ...data, id: docId } as RideHistoryEntry;
          if (!historyMap[docId] && (!entry.rideId || !historyMap[entry.rideId])) {
            historyMap[docId] = entry;
          }
        });
      } catch (topErr) {
        console.warn('Could not query top-level ride_history:', topErr);
      }

      // 4. Merge, sort by completion date, and cache locally
      const historyList = Object.values(historyMap);
      historyList.sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0));

      // Update local storage with full fresh list
      const top30 = historyList.slice(0, 30);
      if (top30.length > 0) {
        try {
          const key = `${LOCAL_HISTORY_STORAGE_PREFIX}${userId}`;
          await AsyncStorage.setItem(key, JSON.stringify(top30));
        } catch (e) {}
      }

      return top30;
    } catch (e) {
      console.warn('getRideHistory failed:', e);
      // Fallback to local storage on any error
      return getFromLocalHistory(userId);
    }
  },

  /**
   * Delete a single ride history entry for a user
   */
  async deleteRideHistory(historyId: string, userId?: string, rideId?: string): Promise<void> {
    if (!historyId) return;
    const uid = userId || auth.currentUser?.uid;
    try {
      // 1. Delete from local cache immediately
      if (uid) {
        await removeFromLocalHistory(uid, historyId, rideId);
      }

      // 2. Top-level ride_history document
      const historyRef = doc(db, 'ride_history', historyId);
      await deleteDoc(historyRef).catch(() => {});

      // 3. User subcollection history document
      if (uid) {
        const userHistRef = doc(db, 'users', uid, 'ride_history', historyId);
        await deleteDoc(userHistRef).catch(() => {});

        if (rideId && rideId !== historyId) {
          const legacyUserHistRef = doc(db, 'users', uid, 'ride_history', rideId);
          await deleteDoc(legacyUserHistRef).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('deleteRideHistory failed:', e);
    }
  },

  /**
   * Clear all ride history entries for a specific user
   */
  async clearAllRideHistory(userId: string): Promise<void> {
    if (!userId) return;
    try {
      // 1. Clear local cache immediately
      await clearLocalHistory(userId);

      // 2. Clear top-level history records
      const historyRef = collection(db, 'ride_history');
      const q = query(historyRef, where('memberUids', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit().catch(() => {});

      // 3. Clear user subcollection
      const userHistRef = collection(db, 'users', userId, 'ride_history');
      const userSnap = await getDocs(userHistRef);
      const batch2 = writeBatch(db);
      userSnap.forEach((docSnap) => {
        batch2.delete(docSnap.ref);
      });
      await batch2.commit().catch(() => {});
    } catch (e) {
      console.warn('clearAllRideHistory failed:', e);
    }
  },
};

export default RideService;
