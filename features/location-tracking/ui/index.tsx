import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverLocation } from './CaregiverLocation';

export default defineFeatureUi({
  widgets: [
    // After the reminders. No patient widget yet: the device tracker is not wired into the app (see CLAUDE.md),
    // so a "sharing your location" status would not be true.
    { id: 'location-tracking', role: 'primary_caregiver', order: 20, Component: CaregiverLocation },
  ],
});
