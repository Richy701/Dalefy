import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { PreviewContext } from './context';
import { setPreviewDate } from './clock';
import { darkColors, lightColors } from '../mobile/constants/theme';
import type { Trip } from '../mobile/shared/types';

// Import failures are caught by the boundary as well as screen rendering errors.
const MotionSettings = lazy(() => import('./motion'));
const TripScreen = lazy(() => import('../mobile/app/trip/[id]'));
const EventScreen = lazy(() => import('../mobile/app/trip/event'));
const InfoScreen = lazy(() => import('../mobile/app/trip/info'));
export interface PreviewPayload {
  trip: Trip;
  brand: { name: string; logoUrl: string | null; accentColor: string | null };
  theme: 'light' | 'dark';
  today: string | null;
  textScale: number;
  activeEventId: string | null;
  role: 'traveler' | 'leader';
  reducedMotion: boolean;
}
export interface PreviewRoute { pathname: string; params: Record<string, string>; }

function Preview() {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [route, setRoute] = useState<PreviewRoute>({ pathname: '/trip/[id]', params: {} });
  const navigate = useCallback((target: string | PreviewRoute) => {
    const next = typeof target === 'string'
      ? { pathname: target.split('?')[0], params: Object.fromEntries(new URLSearchParams(target.split('?')[1])) }
      : target;
    if (['/trip/[id]', '/trip/event', '/trip/info'].includes(next.pathname)) setRoute(next);
  }, []);
  const previousRef = useRef<PreviewPayload | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'dalefy:mobile-preview') return;
      const next = event.data.payload as PreviewPayload;
      if (!next?.trip?.id || !Array.isArray(next.trip.events) || !next.brand) return;
      const previous = previousRef.current;
      setRoute(current => {
        const followEditor = previous?.trip.id !== next.trip.id || previous?.activeEventId !== next.activeEventId;
        const removedEvent = current.pathname === '/trip/event' && !next.trip.events.some(event => event.id === current.params.eventId);
        if (!followEditor && !removedEvent) return current;
        return next.activeEventId && next.trip.events.some(event => event.id === next.activeEventId)
          ? { pathname: '/trip/event', params: { tripId: next.trip.id, eventId: next.activeEventId } }
          : { pathname: '/trip/[id]', params: { id: next.trip.id } };
      });
      previousRef.current = next;
      setPreviewDate(next.today);
      setData(next);
      const colors = next.theme === 'dark' ? darkColors : lightColors;
      parent.postMessage({ type: 'dalefy:mobile-preview-colors', colors: { bg: colors.bg, ink: colors.textPrimary } }, location.origin);
    };
    window.addEventListener('message', receive);
    parent.postMessage({ type: 'dalefy:mobile-preview-ready' }, location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  if (!data) return <Loading />;
  const back = () => setRoute({ pathname: '/trip/[id]', params: { id: data.trip.id } });
  return <PreviewContext.Provider value={{ ...data, route, navigate, back }}>
    <div key={data.today || 'real'} style={{ display: 'flex', flex: 1, minWidth: 0, position: 'relative', colorScheme: data.theme, color: (data.theme === 'dark' ? darkColors : lightColors).textPrimary, background: (data.theme === 'dark' ? darkColors : lightColors).bg, zoom: data.textScale || 1 }}>
      <ErrorBoundary resetKeys={[data.trip.id, route.pathname]} fallbackRender={({ resetErrorBoundary }) => (
        <div role="alert" style={{ margin: 'auto', padding: 24, font: '14px system-ui', color: '#888' }}>
          <p>The mobile preview couldn’t load.</p>
          <button onClick={resetErrorBoundary}>Try again</button>
        </div>
      )}>
        <Suspense fallback={<Loading />}>
          <MotionSettings reduced={data.reducedMotion} />
          {route.pathname === '/trip/event' ? <EventScreen key={route.params.eventId} />
            : route.pathname === '/trip/info' ? <InfoScreen /> : <TripScreen key={data.trip.id} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  </PreviewContext.Provider>;
}
function Loading() { return <div role="status" style={{ margin: 'auto', font: '13px system-ui', color: '#888' }}>Loading preview…</div>; }
createRoot(document.getElementById('root')!).render(<Preview />);
