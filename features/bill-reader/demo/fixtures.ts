import type { BillReading } from '@core/ai/documents';

/**
 * What the canned "AI" says for each demo sample picture (they match the printed text). Fictional. When the real AI is
 * switched on (DATA_MODE_DOCUMENTS=live) these are NOT used: the samples go through the model like any photo.
 */
export const SAMPLE_READINGS: Record<string, BillReading> = {
  water: {
    isBill: true,
    utility: 'water',
    payee: 'Fictional Water Co',
    amountCents: 3150,
    dueDate: '2026-11-20',
    redFlags: [],
    confidence: 0.96,
  },
  electric: {
    isBill: true,
    utility: 'electric',
    payee: 'Sunrise Electric',
    amountCents: 8412,
    dueDate: '2026-11-12',
    redFlags: [],
    confidence: 0.95,
  },
  internet: {
    isBill: true,
    utility: 'internet',
    payee: 'BrightNet Internet',
    amountCents: 5999,
    dueDate: '2026-11-28',
    redFlags: [],
    confidence: 0.95,
  },
  scam: {
    isBill: true,
    utility: 'other',
    payee: 'County Revenue Office',
    amountCents: 49900,
    dueDate: '2026-10-25',
    redFlags: ['gift_cards', 'threat', 'pay_by_phone', 'final_notice'],
    confidence: 0.93,
  },
};
