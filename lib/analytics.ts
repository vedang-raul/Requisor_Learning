type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

/**
 * Best-effort custom analytics. Replit injects Umami only in published apps
 * with analytics enabled, so this safely does nothing in development.
 */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never interrupt the product experience.
  }
}