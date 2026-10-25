import type { LocationReadContract } from '@contracts/location';

/**
 * The real `LocationReadContract`, as other features get it from `getProviders().location`. Lazy: the manifest is also
 * bundled into the app, so server code is only loaded on the first call. Always the CURRENT runtime's contract, so a
 * demo reset (new store) is picked up.
 */
const contract = async () => (await import('./server/runtime')).getRuntime().service.contract;

export const locationPort: LocationReadContract = {
  getLastKnown: async (req) => (await contract()).getLastKnown(req),
  registerGeofence: async (spec) => (await contract()).registerGeofence(spec),
  removeGeofence: async (id) => (await contract()).removeGeofence(id),
  onGeofenceEvent(handler) {
    let off: (() => void) | undefined;
    let cancelled = false;
    void contract().then((c) => {
      if (!cancelled) off = c.onGeofenceEvent(handler);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  },
};
