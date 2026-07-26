import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';

export type HazardCategory =
  | 'accident'
  | 'police'
  | 'traffic'
  | 'roadblock'
  | 'waterlogging'
  | 'construction'
  | 'animal'
  | 'pothole'
  | 'gravel'
  | 'fallentree'
  | 'fog'
  | 'oilspill';

export interface HazardReport {
  id?: string;
  category: HazardCategory;
  title: string;
  icon: keyof typeof Ionicons.glyphMap | string;
  latitude: number;
  longitude: number;
  reportedBy: string;
  timestamp: number;
}

export const HAZARD_TYPES: { category: HazardCategory; title: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { category: 'accident', title: 'Accident', icon: 'car-sport', color: '#EF4444' },
  { category: 'police', title: 'Police', icon: 'shield-checkmark', color: '#3B82F6' },
  { category: 'traffic', title: 'Heavy Traffic', icon: 'car', color: '#F59E0B' },
  { category: 'roadblock', title: 'Road Block', icon: 'construct', color: '#EF4444' },
  { category: 'waterlogging', title: 'Water Logging', icon: 'water', color: '#06B6D4' },
  { category: 'construction', title: 'Construction', icon: 'build', color: '#F59E0B' },
  { category: 'animal', title: 'Animal on Road', icon: 'paw', color: '#10B981' },
  { category: 'pothole', title: 'Pothole', icon: 'disc', color: '#64748B' },
  { category: 'gravel', title: 'Loose Gravel', icon: 'layers', color: '#64748B' },
  { category: 'fallentree', title: 'Fallen Tree', icon: 'leaf', color: '#10B981' },
  { category: 'fog', title: 'Heavy Fog', icon: 'cloudy', color: '#94A3B8' },
  { category: 'oilspill', title: 'Oil Spill', icon: 'flame', color: '#EF4444' },
];

export const HazardService = {
  /**
   * Report a hazard in an active ride session
   */
  async reportHazard(
    rideId: string,
    category: HazardCategory,
    latitude: number,
    longitude: number,
    reportedBy: string
  ): Promise<void> {
    const info = HAZARD_TYPES.find((h) => h.category === category) || {
      title: 'Hazard',
      icon: 'warning',
    };

    const hazard: HazardReport = {
      category,
      title: info.title,
      icon: info.icon,
      latitude,
      longitude,
      reportedBy,
      timestamp: Date.now(),
    };

    const hazardsRef = collection(db, 'rides', rideId, 'hazards');
    await addDoc(hazardsRef, hazard);
  },

  /**
   * Subscribe to live hazard reports in a ride session (filtering out reports > 1 hour old)
   */
  subscribeToHazards(rideId: string, callback: (hazards: HazardReport[]) => void) {
    const hazardsRef = collection(db, 'rides', rideId, 'hazards');
    return onSnapshot(hazardsRef, (snapshot) => {
      const oneHourAgo = Date.now() - 3600000;
      const hazards: HazardReport[] = [];
      snapshot.forEach((docSnap) => {
        const h = { id: docSnap.id, ...docSnap.data() } as HazardReport;
        if (h.timestamp > oneHourAgo) {
          hazards.push(h);
        }
      });
      callback(hazards);
    });
  },
};

export default HazardService;
