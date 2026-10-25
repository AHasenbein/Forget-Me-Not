/**
 * Browser helpers: turn a chosen file into a size-limited JPEG frame. Native phones use the camera instead
 * (a gallery picker would need expo-image-picker, which needs a new dev build).
 */
export interface Frame {
  mediaType: 'image/jpeg';
  data: string; // base64, no data: prefix
}

const MAX_SIDE = 1600;

/** Re-draws a file at a sensible size (a phone photo can be many MB) and returns it as JPEG base64. */
export async function fileToFrame(file: Blob): Promise<Frame> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#fff'; // flatten transparency (PNG) so it does not turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { mediaType: 'image/jpeg', data: url.replace(/^data:[^,]*,/, '') };
}

/** Opens the browser's file chooser (photos only). Resolves null if the person closes it without choosing. */
export function chooseImageWeb(): Promise<Frame | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      fileToFrame(file).then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
