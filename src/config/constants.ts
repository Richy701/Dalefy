/** App-wide timing constants (milliseconds). */

/** Max time to wait for Firebase session validation before falling back to cached user. */
export const SESSION_TIMEOUT_MS = 10_000;

/** Max time to wait for profile fetch before using fallback data. */
export const PROFILE_TIMEOUT_MS = 8000;

/** Max time to wait for org data to load before unblocking the UI. */
export const ORG_LOAD_TIMEOUT_MS = 10_000;

/** Duration of the marching-ants arc animation on the trip map (per segment). */
export const ARC_ANIMATION_MS = 4000;
