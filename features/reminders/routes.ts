import { now as clockNow } from '@core/clock';
import type { RouteContext } from '@core/feature-registry/manifest';
import type { AuthUser } from '@core/auth/types';
import type { CreateScheduleInput, PatchScheduleInput } from './schemas';
import { getService } from './runtime';

// access (in the manifest) guarantees a user on every route here; services re-check role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const listSchedules = (c: RouteContext) => getService().listSchedules(user(c));
export const createSchedule = (c: RouteContext) =>
  getService().createSchedule(user(c), c.body as CreateScheduleInput);
export const updateSchedule = (c: RouteContext) =>
  getService().updateSchedule(user(c), c.params.id!, c.body as PatchScheduleInput);
export const deleteSchedule = async (c: RouteContext) => {
  await getService().deleteSchedule(user(c), c.params.id!);
  return { ok: true };
};
// `now` is the SERVER's app time (it can be sped up in demo): clients must use it, not the device clock.
export const today = async (c: RouteContext) => ({
  now: clockNow().toISOString(),
  occurrences: await getService().today(user(c)),
});
export const history = (c: RouteContext) =>
  getService().history(user(c), Number(c.query.days ?? 7));
export const confirm = (c: RouteContext) => getService().confirm(user(c), c.params.id!);
export const snooze = (c: RouteContext) => getService().snooze(user(c), c.params.id!);
