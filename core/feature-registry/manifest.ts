import type { z } from 'zod';
import type { CirclePermission, Role } from '@contracts/circle';
import type { EventName } from '@contracts/events';
import type { AuthUser } from '../auth/types';
import type { DemoWorld } from '../demo/world';
import type { EventBus } from '../events/bus';

export interface RouteContext {
  user: AuthUser | null; // null only on `public` routes
  body: unknown; // already validated against `input` when provided
  params: Record<string, string>;
  query: Record<string, string>;
}

/**
 * Every route MUST declare access. There is no default: missing access fails the route-auth test.
 * If `roles` includes 'circle_member', `circlePermission` is REQUIRED: the grant a member needs
 * (enforced by core/server), or `null` to state deliberately that no grant applies.
 * Patient linkage (IDOR) is still the handler's job: scope every query by `user.patientId`.
 */
export type RouteAccess =
  | { public: true }
  | { roles: readonly [Role, ...Role[]]; circlePermission?: CirclePermission | null };

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to /api/<feature-name>. Example: '/checkins/:id' */
  path: string;
  access: RouteAccess;
  /** Max request body in bytes (default 64 KB). Routes that take uploads (photos) must raise it explicitly. */
  maxBodyBytes?: number;
  /** Zod schema for the JSON body. Required for POST/PUT/PATCH on non-public routes. */
  input?: z.ZodType;
  handler(ctx: RouteContext): unknown | Promise<unknown>;
}

export interface NavItem {
  label: string;
  route: string; // expo-router path
  roles: readonly Role[];
}

export interface FeatureManifest {
  /** kebab-case; must equal the folder name. */
  name: string;
  /** Feature flag default. New features ship `false` so unfinished work can merge safely. */
  enabledByDefault: boolean;
  routes: readonly RouteDef[];
  nav: readonly NavItem[];
  /** Permission names this feature introduces (documentation + audit). */
  permissions: readonly string[];
  events: { emits: readonly EventName[]; consumes: readonly EventName[] };
  /** Filenames in features/<name>/migrations/, formatted <name>__<YYYYMMDDHHmm>_<desc>.sql */
  migrations: readonly string[];
  /** Background work (e.g. the reminders sweep). Run by core/jobs/runner in the server process. */
  jobs?: readonly { name: string; everyMs: number; run(): void | Promise<void> }[];
  /** Clears this feature's demo data (settings > Reset demo). Demo mode only. */
  demoReset?(): void | Promise<void>;
  /**
   * Canned data for demos/dev (REQUIRED for any feature with user-visible data). Seed from the shared
   * `world` so the story is consistent across features. Idempotent. Only ever run in demo mode.
   */
  demoSeed?(deps: { world: DemoWorld; bus: EventBus }): void | Promise<void>;
  /** Env vars owned by this feature, each prefixed with the upper-snake feature name. */
  env?: z.ZodRawShape;
  /**
   * The mobile app imports manifests too (generated registry): route handlers must lazy-import
   * server-only modules, e.g. `handler: async (ctx) => (await import('./server/service')).run(ctx)`.
   * Subscribe to events here. Not called when the feature is flagged off (fully inert). */
  register?(deps: { bus: EventBus }): void;
}

export const defineFeature = (m: FeatureManifest): FeatureManifest => m;
