import type { LocationReadContract } from '@contracts/location';
import type { AiClient } from '../ai/client';
import type { TokenVerifier } from '../auth/types';
import type { Notifier } from '../notifications';

export interface BankTransaction {
  id: string;
  amountCents: number;
  payee: string;
  paid: boolean;
  dueDate?: string; // ISO date
}
/** Plaid port. Sandbox only, even in live mode. */
export interface PlaidPort {
  listTransactions(patientId: string): Promise<BankTransaction[]>;
}

/** Everything a feature talks to outside itself. Features get these injected, never import adapters. */
export interface Providers {
  ai: AiClient;
  plaid: PlaidPort;
  notifier: Notifier;
  location: LocationReadContract;
  /** demo: `demo:<role>` tokens (role switching). live: real JWT verification (Stage 2). */
  verifier: TokenVerifier;
}
