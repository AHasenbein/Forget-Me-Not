/**
 * Location-read contract. location-tracking is the SINGLE owner of location data.
 * Other features (friends-family, lost-button, ...) consume it only through this interface.
 * The implementation must audit-log every read (requesterId + purpose). Stage 2 target.
 */
export interface LocationReading {
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: string; // ISO-8601 UTC
  source: 'gps' | 'network' | 'manual';
  /** True when older than the staleness window; consumers must show "last seen", never "now". */
  stale: boolean;
}

export interface LocationReadRequest {
  patientId: string;
  requesterId: string;
  /** Free-text-free enum so it is safe to log. */
  purpose: 'circle_view' | 'caregiver_view' | 'lost_button' | 'safezone_eval';
}

export interface GeofenceSpec {
  id: string;
  patientId: string;
  center: { lat: number; lng: number };
  radiusM: number;
}

export interface GeofenceEvent {
  geofenceId: string;
  patientId: string;
  kind: 'enter' | 'exit';
  at: string; // ISO-8601 UTC
}

export interface LocationReadContract {
  /** Returns null when location is unavailable or the requester has no grant (fail closed). */
  getLastKnown(req: LocationReadRequest): Promise<LocationReading | null>;
  registerGeofence(spec: GeofenceSpec): Promise<void>;
  removeGeofence(geofenceId: string): Promise<void>;
  /** Debounced by the owner so boundary flapping does not spam consumers. Returns unsubscribe. */
  onGeofenceEvent(handler: (e: GeofenceEvent) => void): () => void;
}
