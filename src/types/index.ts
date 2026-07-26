export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  bikeName?: string;
  emergencyContact?: string;
  ridingExperience?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  ridingStyle?: 'Touring' | 'Adventure' | 'City' | 'Sport';
  favoriteBike?: string;
  notificationsEnabled?: boolean;
  themePreference?: 'dark' | 'light' | 'system';
  createdAt: number;
}

export interface RideSession {
  id: string;
  name: string;
  destination: {
    name: string;
    latitude: number;
    longitude: number;
  };
  startLocation?: {
    latitude: number;
    longitude: number;
  };
  maxGap: number; // in meters (default 500)
  visibility: 'private' | 'public';
  roomCode: string;
  leaderId: string;
  leaderName: string;
  status: 'lobby' | 'active' | 'completed' | 'cancelled' | 'ended';
  createdAt: number;
  lastActivityAt?: number;
  members: string[]; // List of member UIDs
  joinToken?: string;
  qrPayload?: string;
}

export interface RiderLocation {
  userId: string;
  userName: string;
  latitude: number;
  longitude: number;
  speed: number; // in km/h
  heading: number; // heading in degrees
  timestamp: number;
  battery?: number; // optional battery level between 0 and 100
  network: 'online' | 'offline';
  photoURL?: string;
  riderStatus?: 'riding' | 'stopped' | 'break' | 'sos';
}

export interface BroadcastMessage {
  id?: string;
  senderId: string;
  senderName: string;
  type: 'quick' | 'custom';
  commandKey?: string;
  text: string;
  timestamp: number;
}

export interface CompletedRideMaster {
  id: string;
  rideId: string;
  name: string;
  leaderId: string;
  leaderName: string;
  destination: {
    name: string;
    latitude: number;
    longitude: number;
  };
  startLocation?: {
    latitude: number;
    longitude: number;
  };
  startTime: number;
  endTime: number;
  totalDuration: number; // seconds
  members: string[];
  membersCount: number;
  routeCoordinates?: { latitude: number; longitude: number }[];
  hazardsCount?: number;
  completedReason?: 'manual' | 'leader_ended' | 'auto_expired' | 'all_left';
}

export interface RideHistoryEntry {
  id: string;
  rideId: string;
  name: string;
  leaderName: string;
  destinationName: string;
  startLocationName?: string;
  duration: number; // in seconds
  totalDistance: number; // in km
  averageSpeed: number; // in km/h
  topSpeed: number; // in km/h
  membersCount: number;
  startTime: number;
  endTime: number;
  memberUids: string[];
  routeCoordinates?: { latitude: number; longitude: number }[];
  isFavorite?: boolean;
  personalNotes?: string;
}

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Home: undefined;
  CreateRide: undefined;
  JoinRide: undefined;
  WaitingLobby: { rideId: string };
  Ride: { rideId: string };
  RideSummary: { summary: RideHistoryEntry };
  Settings: undefined;
  Profile: undefined;
};
