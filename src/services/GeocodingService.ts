export interface GeocodedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export const GeocodingService = {
  /**
   * Searches for a destination by query text.
   * Uses Photon (Komoot OSM engine) as primary for fast autocomplete without 429 rate limits,
   * with Nominatim as a secondary fallback.
   */
  async searchAddress(queryText: string): Promise<GeocodedLocation[]> {
    if (!queryText || queryText.trim().length < 3) return [];
    
    const cleanQuery = queryText.trim();

    // 1. Primary: Photon (Komoot OSM Geocoder - designed for instant search)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=5`;
      const response = await fetch(photonUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          return data.features.map((feature: any) => {
            const props = feature.properties;
            const [lon, lat] = feature.geometry.coordinates;

            // Format a clean location label
            const labelParts = [
              props.name,
              props.street,
              props.city || props.town || props.village || props.county,
              props.state,
              props.country,
            ].filter(Boolean);

            // Deduplicate label parts
            const uniqueParts = Array.from(new Set(labelParts));
            const displayName = uniqueParts.join(', ');

            return {
              name: displayName || props.name || cleanQuery,
              latitude: lat,
              longitude: lon,
            };
          });
        }
      }
    } catch (photonErr) {
      console.warn('Photon geocoding fallback triggered:', photonErr);
    }

    // 2. Secondary Fallback: Nominatim OpenStreetMap
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=5`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BikerRadarApp/1.0.0 (contact@bikerradar.com)',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.map((item: any) => ({
          name: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        }));
      }
    } catch (error) {
      // Quietly return empty on rate limit to prevent app crash
    }

    return [];
  },
};

export default GeocodingService;
