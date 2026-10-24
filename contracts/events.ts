import type { CheckInEscalated, CheckInMissed, CheckInSent } from './checkin';
import type { GeofenceEvent } from './location';

/**
 * Cross-feature events. Payloads must contain IDs and enums only: no PII, no location
 * coordinates, no document contents. Receivers look data up through contracts.
 */
export interface EventMap {
  'caregiver.alert': {
    patientId: string;
    source: string; // emitting feature name
    severity: 'info' | 'warning' | 'urgent';
    reasonCode: string;
  };
  'checkin.sent': CheckInSent;
  'checkin.missed': CheckInMissed;
  'checkin.escalated': CheckInEscalated;
  'safezone.crossed': GeofenceEvent;
  'circle.member_granted': { patientId: string; memberId: string; permission: string };
  'circle.member_removed': { patientId: string; memberId: string };
}
export type EventName = keyof EventMap;
