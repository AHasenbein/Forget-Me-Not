import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverReminders } from './CaregiverReminders';
import { PatientReminders } from './PatientReminders';

export default defineFeatureUi({
  widgets: [
    { id: 'reminders', role: 'patient', order: 10, Component: PatientReminders },
    { id: 'reminders', role: 'primary_caregiver', order: 10, Component: CaregiverReminders },
  ],
});
