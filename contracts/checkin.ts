/** Check-in event payloads. Emitted/consumed over the core event bus (see contracts/events.ts). */
export interface CheckInSent {
  checkInId: string;
  patientId: string;
  fromId: string;
  kind: 'patient_ok' | 'scheduled_response' | 'member_request';
  at: string; // ISO-8601 UTC
}

export interface CheckInMissed {
  checkInId: string;
  patientId: string;
  dueAt: string;
}

export interface CheckInEscalated {
  checkInId: string;
  patientId: string;
  /** Position in the escalation chain: patient -> circle members -> primary caregiver. */
  step: number;
  notifyId: string;
  reason: 'timeout' | 'member_removed_reroute';
}
