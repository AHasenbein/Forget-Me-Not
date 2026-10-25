import { defineFeatureUi } from '@core/feature-registry/ui';
import { CaregiverBills } from './CaregiverBills';
import { PatientBill } from './PatientBill';

export default defineFeatureUi({
  widgets: [
    // After "Before I pay" (20): outlined, so the patient's ONE primary action stays the reminder.
    { id: 'bill-reader', role: 'patient', order: 25, Component: PatientBill },
    // Near the top, and renders nothing until the patient has shown a bill.
    { id: 'bill-reader', role: 'primary_caregiver', order: 6, Component: CaregiverBills },
  ],
});
