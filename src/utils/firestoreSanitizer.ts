/**
 * Firestore Sanitizer and Validator Utility
 * Prevents "Unsupported field value: undefined" errors by sanitizing all payloads before writing to Firestore.
 */

/**
 * Recursively strips undefined values from an object, replacing them with null or omitting them.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }

  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }

  const sanitizedObj: Record<string, any> = {};

  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value === undefined) {
      sanitizedObj[key] = null;
    } else if (value !== null && typeof value === 'object') {
      sanitizedObj[key] = sanitizeForFirestore(value);
    } else {
      sanitizedObj[key] = value;
    }
  }

  return sanitizedObj as T;
}

export interface RideValidationResult {
  isValid: boolean;
  sanitized: any;
  errors: string[];
}

/**
 * Validates and sanitizes a Ride session or completed ride payload before writing to Firestore.
 */
export function validateAndSanitizeRidePayload(rawPayload: any): RideValidationResult {
  const errors: string[] = [];

  if (!rawPayload || typeof rawPayload !== 'object') {
    return {
      isValid: false,
      sanitized: null,
      errors: ['Payload is null or not an object.'],
    };
  }

  // Clone raw payload
  const payload = { ...rawPayload };

  // 1. Validate & Sanitize Name
  const name = (payload.name || payload.rideName || 'Group Ride').trim();

  // 2. Validate & Sanitize Start Location
  const startLoc = payload.startLocation || {};
  const sanitizedStartLoc = {
    name: (startLoc.name || 'Start Location').trim(),
    latitude: typeof startLoc.latitude === 'number' && !isNaN(startLoc.latitude) ? startLoc.latitude : 0,
    longitude: typeof startLoc.longitude === 'number' && !isNaN(startLoc.longitude) ? startLoc.longitude : 0,
    address: startLoc.address ? String(startLoc.address).trim() : null,
  };

  // 3. Validate & Sanitize Destination
  const destLoc = payload.destination || {};
  const sanitizedDestLoc = {
    name: (destLoc.name || 'Destination').trim(),
    latitude: typeof destLoc.latitude === 'number' && !isNaN(destLoc.latitude) ? destLoc.latitude : 0,
    longitude: typeof destLoc.longitude === 'number' && !isNaN(destLoc.longitude) ? destLoc.longitude : 0,
    address: destLoc.address ? String(destLoc.address).trim() : null,
  };

  // 4. Validate Members & Leader
  const leaderId = (payload.leaderId || payload.userId || 'unknown').trim();
  const leaderName = (payload.leaderName || 'Rider').trim();
  const rawMembers = Array.isArray(payload.members) ? payload.members : [leaderId];
  const members = Array.from(new Set(rawMembers.filter((m: any) => m && typeof m === 'string')));
  if (members.length === 0 && leaderId) {
    members.push(leaderId);
  }

  // 5. Timestamps
  const now = Date.now();
  const createdAt = typeof payload.createdAt === 'number' ? payload.createdAt : now;
  const endedAt = typeof payload.endTime === 'number' ? payload.endTime : typeof payload.endedAt === 'number' ? payload.endedAt : now;

  // Build clean sanitized object
  const cleanRide = {
    ...payload,
    name,
    startLocation: sanitizedStartLoc,
    destination: sanitizedDestLoc,
    leaderId,
    leaderName,
    members,
    createdAt,
    endedAt,
    lastActivityAt: now,
  };

  // Run global sanitizer to strip all remaining `undefined` fields
  const finalSanitized = sanitizeForFirestore(cleanRide);

  return {
    isValid: errors.length === 0,
    sanitized: finalSanitized,
    errors,
  };
}
