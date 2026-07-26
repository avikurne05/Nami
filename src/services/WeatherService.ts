export interface WeatherData {
  temp: number; // in Celsius
  condition: string;
  icon: string;
  readinessStatus: 'Excellent' | 'Good' | 'Moderate' | 'Poor';
  readinessColor: string;
  readinessSub: string;
  cityName?: string;
  timestamp: number;
}

// In-memory cache for 15 minutes (900,000 ms)
let cachedWeather: WeatherData | null = null;

export const WeatherService = {
  /**
   * Fetch current weather from free Open-Meteo API asynchronously (non-blocking)
   */
  async getWeather(lat: number, lon: number, cityName?: string): Promise<WeatherData | null> {
    const now = Date.now();

    // Return cached weather if less than 15 minutes old
    if (cachedWeather && now - cachedWeather.timestamp < 15 * 60 * 1000) {
      if (cityName) cachedWeather.cityName = cityName;
      return cachedWeather;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
      const data = await res.json();

      const current = data.current;
      const temp = Math.round(current?.temperature_2m ?? 28);
      const windSpeed = Math.round(current?.wind_speed_10m ?? 10);
      const precip = current?.precipitation ?? 0;
      const code = current?.weather_code ?? 0;

      // Interpret WMO weather codes
      let condition = 'Clear';
      let icon = 'sunny-outline';
      let readinessStatus: 'Excellent' | 'Good' | 'Moderate' | 'Poor' = 'Excellent';
      let readinessColor = '#10B981'; // Green
      let readinessSub = 'Perfect conditions for riding today.';

      if (code === 0 || code === 1) {
        condition = 'Clear skies';
        icon = 'sunny-outline';
        readinessStatus = 'Excellent';
        readinessColor = '#10B981';
        readinessSub = 'Perfect riding conditions today.';
      } else if (code === 2 || code === 3) {
        condition = 'Partly cloudy';
        icon = 'cloudy-outline';
        readinessStatus = 'Good';
        readinessColor = '#10B981';
        readinessSub = 'Great weather for a motorcycle ride.';
      } else if (precip > 0 || (code >= 51 && code <= 67)) {
        condition = 'Light rain expected';
        icon = 'rainy-outline';
        readinessStatus = 'Moderate';
        readinessColor = '#F59E0B'; // Amber
        readinessSub = 'Rain expected. Roads may become slippery.';
      } else if (code >= 80 || windSpeed > 40) {
        condition = 'High wind / heavy rain';
        icon = 'thunderstorm-outline';
        readinessStatus = 'Poor';
        readinessColor = '#EF4444'; // Red
        readinessSub = 'Challenging weather. Ride with extreme caution.';
      }

      const weatherResult: WeatherData = {
        temp,
        condition,
        icon,
        readinessStatus,
        readinessColor,
        readinessSub,
        cityName: cityName || 'Location',
        timestamp: now,
      };

      cachedWeather = weatherResult;
      return weatherResult;
    } catch (e) {
      console.warn('WeatherService: Non-blocking weather fetch failed:', e);
      // Fallback estimate if fetch fails
      return {
        temp: 29,
        condition: 'Clear',
        icon: 'sunny-outline',
        readinessStatus: 'Excellent',
        readinessColor: '#10B981',
        readinessSub: 'Good riding conditions today.',
        cityName: cityName || 'Location',
        timestamp: now,
      };
    }
  },
};

export default WeatherService;
