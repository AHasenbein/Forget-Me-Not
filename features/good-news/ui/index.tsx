import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverPaperMessage } from './CaregiverPaperMessage';
import { PatientPaper } from './PatientPaper';

export default defineFeatureUi({
  widgets: [
    // First on the patient's screen: the paper opens by itself once a day, then stays as a small card.
    { id: 'morning-paper', role: 'patient', order: 1, Component: PatientPaper },
    {
      id: 'paper-message',
      role: 'primary_caregiver',
      order: 15,
      section: 'messages', // its own box in the caregiver grid (two even rows of three)
      Component: CaregiverPaperMessage,
    },
  ],
});
