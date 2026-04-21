/** Dev-only logger — all output is stripped in production builds. */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (tag: string, ...args: unknown[]) => {
    if (isDev) console.log(`[${tag}]`, ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[${tag}]`, ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    if (isDev) console.error(`[${tag}]`, ...args);
  },
};
