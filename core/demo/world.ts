import type { GeofenceSpec, LocationReading } from '@contracts/location';
import type { CheckInSent } from '@contracts/checkin';
import type { AuthUser } from '../auth/types';
import type { BankTransaction } from '../providers/types';

export interface Point {
  lat: number;
  lng: number;
}

/**
 * The canned demo world: ONE fictional household that every feature's demo data builds on, so the
 * demo tells a consistent story across features. Everything is fictional (555 numbers, made-up
 * address). IDs are fixed; timestamps are relative to `now` so "2 minutes ago" is always true.
 * Add what your feature needs here ONLY if several features share it; otherwise keep it in
 * features/<name>/demo/.
 */
export interface DemoWorld {
  now: Date;
  patient: AuthUser;
  caregiver: AuthUser;
  /** Has a location grant. */
  daughter: AuthUser;
  /** Check-ins only, NO location grant. */
  friend: AuthUser;
  profile: { firstName: string; homeAddress: string; timeZone: string };
  location: {
    home: Point;
    park: Point;
    path: Point[];
    lastKnown: LocationReading;
    safeZones: GeofenceSpec[];
  };
  checkIns: CheckInSent[];
  bills: BankTransaction[];
  reminders: { id: string; kind: 'pill' | 'brush_teeth' | 'shower' | 'feed_pets'; time: string }[];
  scamCall: {
    id: string;
    callerNumber: string;
    transcript: string;
    summary: string;
    confidence: number;
  };
  giftCardRequest: { id: string; merchant: string; amountCents: number; status: 'pending' };
  document: { id: string; title: string; text: string };
  news: string[];
}

export function buildDemoWorld(now: Date = new Date()): DemoWorld {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const home = { lat: 40.7128, lng: -74.006 };
  const park = { lat: 40.7138, lng: -74.0 };
  const patient: AuthUser = {
    id: 'demo-patient',
    role: 'patient',
    patientId: 'demo-patient',
    grants: [],
  };
  const link = (id: string, role: AuthUser['role'], grants: AuthUser['grants'] = []): AuthUser => ({
    id,
    role,
    patientId: patient.id,
    grants,
  });
  return {
    now,
    patient,
    caregiver: link('demo-caregiver', 'primary_caregiver'),
    daughter: link('demo-daughter', 'circle_member', [
      'receive_checkins',
      'send_checkins',
      'view_location',
      'receive_safezone_alerts',
    ]),
    friend: link('demo-friend', 'circle_member', ['receive_checkins', 'send_checkins']),
    profile: {
      firstName: 'Margaret',
      homeAddress: '12 Maple Lane, Springfield (fictional)',
      timeZone: 'America/New_York',
    },
    location: {
      home,
      park,
      path: Array.from({ length: 11 }, (_, i) => ({
        lat: home.lat + ((park.lat - home.lat) * i) / 10,
        lng: home.lng + ((park.lng - home.lng) * i) / 10,
      })),
      lastKnown: { ...park, accuracyM: 12, recordedAt: ago(2), source: 'gps', stale: false },
      safeZones: [
        { id: 'demo-zone-home', patientId: patient.id, center: home, radiusM: 150 },
        { id: 'demo-zone-park', patientId: patient.id, center: park, radiusM: 200 },
      ],
    },
    checkIns: [
      {
        checkInId: 'demo-ci-1',
        patientId: patient.id,
        fromId: patient.id,
        kind: 'patient_ok',
        at: ago(180),
      },
      {
        checkInId: 'demo-ci-2',
        patientId: patient.id,
        fromId: 'demo-daughter',
        kind: 'member_request',
        at: ago(30),
      },
    ],
    bills: [
      {
        id: 'demo-bill-1',
        payee: 'City Electric',
        amountCents: 8423,
        paid: true,
        dueDate: ago(60 * 24 * 5).slice(0, 10),
      },
      {
        id: 'demo-bill-2',
        payee: 'Springfield Water',
        amountCents: 3150,
        paid: false,
        dueDate: ago(-60 * 24 * 3).slice(0, 10),
      },
    ],
    reminders: [
      { id: 'demo-rem-1', kind: 'pill', time: '08:00' },
      { id: 'demo-rem-2', kind: 'brush_teeth', time: '08:30' },
      { id: 'demo-rem-3', kind: 'feed_pets', time: '17:00' },
    ],
    scamCall: {
      id: 'demo-call-1',
      callerNumber: '+1-555-0100',
      transcript:
        'This is the IRS. You owe back taxes. Buy gift cards and read me the numbers right now.',
      summary: 'Likely scam: caller claims to be the IRS and asks for gift card numbers.',
      confidence: 0.96,
    },
    giftCardRequest: {
      id: 'demo-gc-1',
      merchant: 'Gift Cards Plus',
      amountCents: 5000,
      status: 'pending',
    },
    document: {
      id: 'demo-doc-1',
      title: 'Medicare Summary Notice',
      text: 'This is not a bill. Your plan paid $212.40 for your visit on March 3. You may owe $18.00.',
    },
    news: [
      'Local library opens a new garden reading room',
      'Springfield park welcomes spring flowers',
      'Community choir performs this Saturday',
    ],
  };
}
