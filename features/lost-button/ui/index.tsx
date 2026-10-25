import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverAlert } from './CaregiverAlert';
import { PatientLost } from './PatientLost';

export default defineFeatureUi({
  widgets: [
    // After the reminders (10), above "Before I pay" (20): outlined, so the ONE primary action stays the reminder.
    { id: 'lost-button', role: 'patient', order: 15, Component: PatientLost },
    // First on the caregiver dashboard, and renders nothing until an alert is open.
    {
      id: 'lost-button',
      role: 'primary_caregiver',
      section: 'alerts',
      order: 1,
      Component: CaregiverAlert,
    },
  ],
});
