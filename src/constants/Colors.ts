export const DarkColors = {
  background: '#0F172A',
  card: '#1E293B',
  cardElevated: '#263348',
  primary: '#1A73E8', // Google-style Navigation Blue
  secondary: '#0F172A', // Dark Navy
  accent: '#00E5FF', // Safety Cyan
  success: '#10B981', // Green
  warning: '#F59E0B',
  danger: '#EF4444', // Modern Red
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  textSecondary: '#CBD5E1',
  border: '#334155',
  inputBg: '#0F172A',
  navBanner: '#1A73E8',
  navBannerText: '#FFFFFF',
  mapTileUrl: 'https://a.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}@2x.png',
  isDark: true,
};

export const LightColors = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardElevated: '#F1F5F9',
  primary: '#1A73E8', // Google-style Navigation Blue
  secondary: '#0F172A',
  accent: '#00E5FF',
  success: '#10B981',
  warning: '#D97706',
  danger: '#EF4444',
  text: '#0F172A',
  textMuted: '#64748B',
  textSecondary: '#475569',
  border: '#E2E8F0',
  inputBg: '#FFFFFF',
  navBanner: '#1A73E8',
  navBannerText: '#FFFFFF',
  mapTileUrl: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  isDark: false,
};

export interface ColorPalette {
  background: string;
  card: string;
  cardElevated: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  border: string;
  inputBg: string;
  navBanner: string;
  navBannerText: string;
  mapTileUrl: string;
  isDark: boolean;
}

export const Colors = DarkColors;
export default Colors;
