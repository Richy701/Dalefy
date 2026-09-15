# Mobile preview

The editor embeds `mobile-preview.html`, which compiles the actual trip, event,
and information screens from `mobile/app/trip`. Do not add screen layouts here.
Mobile components, typography, colours, photo fades and date calculations come
from the mobile source. Vite watches these files during development and includes
the latest source in every website deployment. An EAS-only OTA release does not
itself deploy the website; deploy both when releasing shared UI changes.

`vite-plugin.ts` adapts the platform boundary: React Native Web, Phosphor web
icons, routing, contexts and native-only services. Reanimated uses its official
web modules and Worklets Babel plugin in development and production. Keep the
same web resolution in dependency optimisation and production bundling.

The iframe receives the editor's current trip, filtered events, brand and preview
preferences using same-origin messages checked against the parent window. It
has no separate login, database subscription or write methods. Traveller view
filters leader-only information; selecting a named traveller keeps that role.
Simulated time is scoped to the imported mobile source, not the editor or browser
animation clock. Native Mapbox views, long-press menus, haptics, widgets and
platform navigation transitions still require device verification.

## Verify

Run `npm run dev` and open `/tests/mobile-preview/harness.html` locally. This
fixture renders the actual editor component and is excluded from deployments.
Check trip edits, event editor following, trip/event/info navigation, dark/light
switching, role visibility, screen widths, text size, date simulation, reduced
motion and reset. Change a mobile screen/component and confirm Vite updates it.
Run `npm run build` before shipping: missing or incompatible native imports must
fail the build instead of silently falling back to a copied screen.
