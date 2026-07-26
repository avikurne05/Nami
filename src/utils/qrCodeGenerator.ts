export interface BikerRadarQRPayload {
  version: number;
  rideId: string;
  roomCode: string;
  leaderId: string;
  joinToken: string;
  createdAt: number;
}

export function generateBikerRadarJoinToken(): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `${randomPart}-${timePart}`;
}

export function generateBikerRadarQRPayload(
  rideId: string,
  roomCode: string,
  leaderId: string,
  joinToken: string
): string {
  const payload: BikerRadarQRPayload = {
    version: 1,
    rideId,
    roomCode: roomCode.toUpperCase().trim(),
    leaderId,
    joinToken,
    createdAt: Date.now(),
  };

  return `BIKERRADAR:${JSON.stringify(payload)}`;
}

export function parseBikerRadarQRPayload(
  rawInput: string
): {
  rideId?: string;
  roomCode: string;
  joinToken?: string;
  leaderId?: string;
  version?: number;
} | null {
  if (!rawInput || typeof rawInput !== 'string') return null;

  let text = rawInput.trim();

  if (text.startsWith('BIKERRADAR:')) {
    const content = text.replace('BIKERRADAR:', '').trim();
    if (content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content) as BikerRadarQRPayload;
        if (parsed && (parsed.roomCode || parsed.rideId)) {
          return {
            rideId: parsed.rideId,
            roomCode: (parsed.roomCode || '').toUpperCase().trim(),
            joinToken: parsed.joinToken,
            leaderId: parsed.leaderId,
            version: parsed.version || 1,
          };
        }
      } catch (e) {
        console.warn('Failed to parse BikerRadar QR JSON payload:', e);
      }
    } else {
      // Legacy "BIKERRADAR:<ROOM_CODE>"
      const code = content.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
      if (code.length === 6) {
        return { roomCode: code };
      }
    }
  }

  // Handle URL format: "https://bikerradar.app/join/<ROOM_CODE>"
  if (text.includes('/JOIN/')) {
    const code = text.split('/JOIN/')[1]?.split('?')[0]?.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    if (code && code.length === 6) {
      return { roomCode: code };
    }
  }

  // Raw 6-character room code
  const cleanCode = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  if (cleanCode.length === 6) {
    return { roomCode: cleanCode };
  }

  return null;
}
