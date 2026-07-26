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
import { db } from '../firebase/config';
import { RideSession, RideHistoryEntry, CompletedRideMaster } from '../types';
import { generateRoomCode } from '../utils';
import { sanitizeForFirestore, validateAndSanitizeRidePayload } from '../utils/firestoreSanitizer';
import { generateBikerRadarJoinToken, generateBikerRadarQRPayload, parseBikerRadarQRPayload } from '../utils/qrCodeGenerator';

// Configurable inactivity timeout (default 24 hours)
export const RIDE_EXPIRATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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
    const joinToken = generateBikerRadarJoinToken();
    const qrPayload = generateBikerRadarQRPayload(rideRef.id, roomCode, leaderId, joinToken);

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

    const sanitizedRide = sanitizeForFirestore(newRide);
    await setDoc(rideRef, sanitizedRide);
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
   * Validates a scanned QR payload or room code with cryptographic joinToken verification
   * and network connectivity distinction.
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
    const parsed = parseBikerRadarQRPayload(rawPayload);
    if (!parsed || !parsed.roomCode) {
      return {
        success: false,
        errorCode: 'INVALID_TOKEN',
        errorMessage: 'Invalid Biker Radar QR Code',
      };
    }

    try {
      let rideSnap;
      if (parsed.rideId) {
        rideSnap = await getDoc(doc(db, 'rides', parsed.rideId));
      }

      let rideData: RideSession | null = null;
      let targetRideId: string = parsed.rideId || '';

      if (rideSnap && rideSnap.exists()) {
        rideData = { id: rideSnap.id, ...rideSnap.data() } as RideSession;
      } else {
        const ridesRef = collection(db, 'rides');
        const q = query(ridesRef, where('roomCode', '==', parsed.roomCode));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
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

      // 1. Status & Expiration Check
      if (rideData.status === 'completed' || rideData.status === 'cancelled' || rideData.status === 'ended') {
        return {
          success: false,
          errorCode: 'EXPIRED',
          errorMessage: 'Ride Expired',
        };
      }

      const lastActive = rideData.lastActivityAt || rideData.createdAt;
      if (Date.now() - lastActive > RIDE_EXPIRATION_TIMEOUT_MS) {
        await this.expireRide(targetRideId, 'auto_expired');
        return {
          success: false,
          errorCode: 'EXPIRED',
          errorMessage: 'Ride Expired',
        };
      }

      // 2. Cryptographic joinToken Verification (if payload contains token)
      if (parsed.joinToken && rideData.joinToken && parsed.joinToken !== rideData.joinToken) {
        return {
          success: false,
          errorCode: 'INVALID_TOKEN',
          errorMessage: 'Invalid or Revoked QR Code',
        };
      }

      // 3. Join Ride Session in Firestore
      if (userId && !rideData.members.includes(userId)) {
        await updateDoc(doc(db, 'rides', targetRideId), {
          members: arrayUnion(userId),
          lastActivityAt: Date.now(),
        });
      }

      return {
        success: true,
        rideId: targetRideId,
        status: rideData.status,
      };
    } catch (e: any) {
      console.warn('validateAndJoinRide error:', e);
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
    const historyEntry: RideHistoryEntry = {
      id: primaryHistoryRef.id,
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

    try {
      const batch = writeBatch(db);
      batch.set(primaryHistoryRef, sanitizedHistory);

      membersList.forEach((uid) => {
        if (uid) {
          const userHistRef = doc(db, 'users', uid, 'ride_history', rideId);
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
            const userHistRef = doc(db, 'users', uid, 'ride_history', rideId);
            await setDoc(userHistRef, sanitizedHistory);
          } catch (e) {}
        }
      }
    }

    return sanitizedHistory;
  },

  /**
   * Retrieve ride history for a user (combines user-specific history and legacy history)
   */
  async getRideHistory(userId: string): Promise<RideHistoryEntry[]> {
    if (!userId) return [];
    try {
      // 1. Fetch user-specific subcollection history
      const userHistRef = collection(db, 'users', userId, 'ride_history');
      const userSnap = await getDocs(userHistRef);
      const historyMap: { [id: string]: RideHistoryEntry } = {};

      userSnap.forEach((docSnap) => {
        historyMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() } as RideHistoryEntry;
      });

      // 2. Fetch top-level history for backward compatibility
      const historyRef = collection(db, 'ride_history');
      const q = query(historyRef, where('memberUids', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((docSnap) => {
        const entry = { id: docSnap.id, ...docSnap.data() } as RideHistoryEntry;
        if (!historyMap[entry.id] && !historyMap[entry.rideId]) {
          historyMap[entry.id] = entry;
        }
      });

      const historyList = Object.values(historyMap);
      historyList.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
      return historyList.slice(0, 30);
    } catch (e) {
      console.warn('getRideHistory failed:', e);
      return [];
    }
  },

  /**
   * Delete a single ride history entry for a user
   */
  async deleteRideHistory(historyId: string, userId?: string): Promise<void> {
    try {
      const historyRef = doc(db, 'ride_history', historyId);
      await deleteDoc(historyRef).catch(() => {});
      if (userId) {
        const userHistRef = doc(db, 'users', userId, 'ride_history', historyId);
        await deleteDoc(userHistRef).catch(() => {});
      }
    } catch (e) {
      // Quiet fallback
    }
  },

  /**
   * Clear all ride history entries for a specific user
   */
  async clearAllRideHistory(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const historyRef = collection(db, 'ride_history');
      const q = query(historyRef, where('memberUids', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      // Clear user subcollection
      const userHistRef = collection(db, 'users', userId, 'ride_history');
      const userSnap = await getDocs(userHistRef);
      const batch2 = writeBatch(db);
      userSnap.forEach((docSnap) => {
        batch2.delete(docSnap.ref);
      });
      await batch2.commit();
    } catch (e) {
      console.warn('clearAllRideHistory failed:', e);
    }
  },
};

export default RideService;
