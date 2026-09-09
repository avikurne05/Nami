import Config from '../constants/Config';

export interface RouteMetrics {
  distance: number; // in meters
  duration: number; // in seconds
  coordinates: { latitude: number; longitude: number }[];
  nextStepName?: string;
  nextStepManeuver?: string;
}

export const NavigationService = {
  /**
   * Fetches driving/riding route from start to end coordinate using OSRM (primary) or ORS (fallback).
   * OSRM is free, fast, and does not require API keys or fail due to quota/headers.
   */
  async getRoute(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ): Promise<RouteMetrics> {
    try {
      // Primary: Use OSRM public routing engine with proper User-Agent header
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(osrmUrl, {
        headers: {
          'User-Agent': 'NamiApp/1.0.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const geometryCoords: [number, number][] = route.geometry.coordinates;
          const coordinates = geometryCoords.map(([lon, lat]) => ({
            latitude: lat,
            longitude: lon,
          }));

          let nextStepName: string | undefined;
          let nextStepManeuver: string | undefined;

          if (route.legs && route.legs[0] && route.legs[0].steps) {
            const steps = route.legs[0].steps;
            if (steps.length > 0) {
              const step = steps[0];
              nextStepName = step.name || 'destination';
              nextStepManeuver = step.maneuver?.type || 'straight';
            }
          }

          return {
            distance: route.distance, // in meters
            duration: route.duration, // in seconds
            coordinates,
            nextStepName,
            nextStepManeuver,
          };
        }
      }
    } catch (osrmErr) {
      console.warn('OSRM routing fetch failed, trying fallback:', osrmErr);
    }

    // If OSRM fails, retry OSRM or OpenRouteService with full step geometry
    const apiKey = Config.openRouteService.apiKey;
    if (apiKey && apiKey !== 'your-openrouteservice-api-key') {
      try {
        const url = `${Config.openRouteService.baseUrl}/v2/directions/driving-car?api_key=${apiKey}&start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const route = data.features[0];
            const summary = route.properties.summary;
            const geometryCoords: [number, number][] = route.geometry.coordinates;
            const coordinates = geometryCoords.map(([lon, lat]) => ({
              latitude: lat,
              longitude: lon,
            }));

            return {
              distance: summary.distance,
              duration: summary.duration,
              coordinates,
            };
          }
        }
      } catch (orsErr) {
        console.warn('ORS fallback failed:', orsErr);
      }
    }

    // Return empty coordinates if network fails so no straight line is drawn
    return {
      distance: this.calculateStraightLineDistance(start, end),
      duration: this.estimateDuration(start, end),
      coordinates: [],
    };
  },

  calculateStraightLineDistance(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ): number {
    const R = 6371e3; // Earth radius in meters
    const dLat = ((end.latitude - start.latitude) * Math.PI) / 180;
    const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((start.latitude * Math.PI) / 180) *
        Math.cos((end.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  estimateDuration(
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ): number {
    const dist = this.calculateStraightLineDistance(start, end);
    // Assume average speed of 60 km/h (approx 16.67 m/s)
    return dist / 16.67;
  },
};

export default NavigationService;
