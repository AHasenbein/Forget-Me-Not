import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverCheck } from './CaregiverCheck';
import { PatientCheck } from './PatientCheck';

export default defineFeatureUi({
  widgets: [
    // After the reminders (10) so the patient's ONE primary action stays the reminder; this one is outlined.
    {
      id: 'money-check',
      role: 'patient',
      order: 20,
      group: 'before-i-pay',
      Component: PatientCheck,
    },
    // Near the top of the caregiver dashboard, and renders nothing until the patient asks.
    { id: 'money-check', role: 'primary_caregiver', order: 2, Component: CaregiverCheck },
  ],
});
