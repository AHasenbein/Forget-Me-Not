import type { VisionFrame } from '../ai/vision';

/** A real 1x1 PNG. The demo "Use sample photos" button sends this when no camera is available. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
export const DEMO_FRAMES: VisionFrame[] = Array.from({ length: 3 }, () => ({
  mediaType: 'image/png',
  data: PNG_1X1,
}));
