import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverLocation } from './CaregiverLocation';
import { PatientLocationSharing } from './PatientLocationSharing';

export default defineFeatureUi({
  widgets: [
    // After the reminders. The patient widget starts the device tracker and reports its real state.
    { id: 'location-sharing', role: 'patient', order: 90, Component: PatientLocationSharing },
    {
      id: 'location-tracking',
      role: 'primary_caregiver',
      section: 'where',
      order: 20,
      Component: CaregiverLocation,
    },
  ],
});
