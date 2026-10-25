import { defineFeatureUi } from '@core/feature-registry/ui';
import {
  RemindersActivity,
  RemindersAttention,
  RemindersManage,
  RemindersSummary,
  RemindersToday,
  RemindersWeek,
} from './CaregiverReminders';
import { PatientGreeting } from './PatientGreeting';
import { PatientReminders } from './PatientReminders';

export default defineFeatureUi({
  widgets: [
    // Patient, top to bottom: greeting (0), then the morning paper (good-news, 1), then the reminder card (10).
    { id: 'reminders-greeting', role: 'patient', order: 0, Component: PatientGreeting },
    { id: 'reminders', role: 'patient', order: 10, Component: PatientReminders },
    // Caregiver page sections: missed/review alerts, today, manage, week graph, activity log.
    {
      id: 'reminders-alerts',
      role: 'primary_caregiver',
      order: 10,
      section: 'alerts',
      Component: RemindersAttention,
    },
    {
      id: 'reminders-summary',
      role: 'primary_caregiver',
      order: 10,
      section: 'summary',
      Component: RemindersSummary,
    },
    {
      id: 'reminders-today',
      role: 'primary_caregiver',
      order: 10,
      section: 'today',
      Component: RemindersToday,
    },
    {
      id: 'reminders-manage',
      role: 'primary_caregiver',
      order: 10,
      section: 'manage',
      Component: RemindersManage,
    },
    {
      id: 'reminders-week',
      role: 'primary_caregiver',
      order: 10,
      section: 'week',
      Component: RemindersWeek,
    },
    {
      id: 'reminders-activity',
      role: 'primary_caregiver',
      order: 10,
      section: 'activity',
      Component: RemindersActivity,
    },
  ],
});
