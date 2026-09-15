import { createContext, useContext } from 'react';
import { darkColors, lightColors, applyAccentHex } from '../mobile/constants/theme';
import type { PreviewPayload, PreviewRoute } from './main';
interface PreviewState extends PreviewPayload {
  route: PreviewRoute;
  navigate: (route: string | PreviewRoute) => void;
  back: () => void;
}
export const PreviewContext = createContext<PreviewState | null>(null);
export function usePreview() {
  const value = useContext(PreviewContext);
  if (!value) throw new Error('Mobile preview context is missing');
  return value;
}
export const useTrips = () => ({ trips: [usePreview().trip], ready: true });
export const useBrand = () => ({ brand: usePreview().brand });
export function useTheme() {
  const { theme, brand } = usePreview();
  const isDark = theme === 'dark';
  return { isDark, C: applyAccentHex(isDark ? darkColors : lightColors, brand.accentColor || '#0bd2b5') };
}
export function useTripRole(_tripId?: string) { const { role } = usePreview(); return { role: role || 'traveler', isLeader: role === 'leader' }; }
export const useLinkedTravelerId = (_tripId?: string) => null;
export const useLocalSearchParams = <T extends Record<string, string | undefined>>() => usePreview().route.params as T;
export function useRouter() {
  const { navigate, back, route } = usePreview();
  return { push: navigate, replace: navigate, back, canGoBack: () => route.pathname !== '/trip/[id]' };
}
