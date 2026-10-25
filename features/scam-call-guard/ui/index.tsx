import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverCalls } from './CaregiverCalls';
import { PatientCallSimulator } from './PatientCallSimulator';

export default defineFeatureUi({
  widgets: [
    { id: 'call-simulator', role: 'patient', order: 80, Component: PatientCallSimulator },
    // Near the top: a scam in progress is the thing a caregiver most needs to see.
    {
      id: 'scam-calls',
      role: 'primary_caregiver',
      section: 'alerts',
      order: 5,
      Component: CaregiverCalls,
    },
  ],
});
