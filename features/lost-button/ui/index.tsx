import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverAlert } from './CaregiverAlert';
import { PatientLost } from './PatientLost';

export default defineFeatureUi({
  widgets: [
    // After the reminders so the patient's ONE primary action stays the reminder; this one is outlined.
    { id: 'lost-button', role: 'patient', order: 90, Component: PatientLost },
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
