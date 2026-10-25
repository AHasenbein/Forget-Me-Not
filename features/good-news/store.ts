import type { CaregiverMessage } from './schemas';

/** Storage port for caregiver messages. Only the in-memory (demo) implementation exists; Supabase is the next step. */
export interface MessageStore {
  get(patientId: string): CaregiverMessage | undefined;
  put(m: CaregiverMessage): void;
  delete(patientId: string): void;
}

export class MemoryMessageStore implements MessageStore {
  private messages = new Map<string, CaregiverMessage>();

  get = (patientId: string) => this.messages.get(patientId);
  put = (m: CaregiverMessage) => void this.messages.set(m.patientId, { ...m });
  delete = (patientId: string) => void this.messages.delete(patientId);
}
