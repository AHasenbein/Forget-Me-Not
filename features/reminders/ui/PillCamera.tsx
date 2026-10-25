import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { VisionFrame } from '@core/ai/vision';
import { useSession } from '@core/client/session';
import { DEMO_FRAMES } from '@core/demo/sample-frames';
import { AppText, BigButton, Card } from '@core/design-system/components';

const FRAMES = 4;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripPrefix = (b64: string) => b64.replace(/^data:[^,]*,/, '');

/**
 * Takes a few photos about a second apart. Asks for camera permission itself; if it is denied or there is
 * no camera, the patient can just skip (the tap already counted). In demo mode a button sends sample photos.
 */
export function PillCamera({
  onFrames,
  onSkip,
}: {
  onFrames: (frames: VisionFrame[]) => void | Promise<void>;
  onSkip: () => void;
}) {
  const { demo } = useSession();
  const [perm, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const [shot, setShot] = useState(0);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    if (taking) return;
    setTaking(true);
    setFailed(false);
    try {
      const frames: VisionFrame[] = [];
      for (let i = 0; i < FRAMES; i++) {
        await wait(1000);
        const pic = await cam.current?.takePictureAsync({
          quality: 0.4,
          base64: true,
          skipProcessing: true,
        });
        if (pic?.base64) frames.push({ mediaType: 'image/jpeg', data: stripPrefix(pic.base64) });
        setShot(i + 1);
      }
      if (!frames.length) throw new Error('no photos');
      await onFrames(frames);
    } catch {
      setFailed(true);
      setTaking(false);
    }
  };

  const sample = demo ? (
    <BigButton
      tone="ghost"
      label="Use sample photos (demo)"
      onPress={() => onFrames(DEMO_FRAMES)}
    />
  ) : null;

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
          I’ll take a few quick photos so your caregiver can see you took your pill.
        </AppText>
        <BigButton label="Yes, use the camera" onPress={() => void ask()} />
        {sample}
        <BigButton tone="ghost" label="No thanks" onPress={onSkip} />
      </Card>
    );
  return (
    <Card>
      <AppText variant="title" center>
        Show your pill, then a sip of water
      </AppText>
      <View style={{ borderRadius: 8, overflow: 'hidden' }}>
        <CameraView ref={cam} facing="front" style={{ height: 320, width: '100%' }} />
      </View>
      {failed ? <AppText center>That didn’t work. You can try again, or skip.</AppText> : null}
      <BigButton
        label={taking ? `Taking photos… ${shot} of ${FRAMES}` : 'Start'}
        busy={false}
        disabled={taking}
        onPress={start}
      />
      {sample}
      <BigButton tone="ghost" label="Skip" disabled={taking} onPress={onSkip} />
    </Card>
  );
}
