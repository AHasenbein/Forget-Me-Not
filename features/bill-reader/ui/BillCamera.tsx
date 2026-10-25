import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, BigButton, Card } from '@core/design-system/components';
import type { Frame } from './image';

const stripPrefix = (b64: string) => b64.replace(/^data:[^,]*,/, '');

/** Back camera, one tap. Asks for permission itself. If it is denied or there is no camera, the patient can go back. */
export function BillCamera({
  onPicture,
  onBack,
}: {
  onPicture: (frame: Frame) => void | Promise<void>;
  onBack: () => void;
}) {
  const [perm, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const take = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const pic = await cam.current?.takePictureAsync({ quality: 0.6, base64: true });
      if (!pic?.base64) throw new Error('no picture');
      await onPicture({ mediaType: 'image/jpeg', data: stripPrefix(pic.base64) });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!perm)
    return (
      <Card>
        <AppText center>One moment…</AppText>
      </Card>
    );
  if (!perm.granted)
    return (
      <Card>
        <AppText variant="title" center>
          Can I use the camera?
        </AppText>
        <AppText center tone="muted">
          I will take a picture of your bill so I can explain it.
        </AppText>
        <BigButton label="Yes, use the camera" onPress={() => void ask()} />
        <BigButton tone="ghost" label="No thanks" onPress={onBack} />
      </Card>
    );
  return (
    <Card>
      <AppText variant="title" center>
        Hold the bill still, then tap
      </AppText>
      <View style={{ borderRadius: 8, overflow: 'hidden' }}>
        <CameraView ref={cam} facing="back" style={{ height: 360, width: '100%' }} />
      </View>
      {failed ? <AppText center>That didn’t work. Please try again.</AppText> : null}
      <BigButton label="Take the picture" busy={busy} onPress={take} />
      <BigButton tone="ghost" label="Back" disabled={busy} onPress={onBack} />
    </Card>
  );
}
