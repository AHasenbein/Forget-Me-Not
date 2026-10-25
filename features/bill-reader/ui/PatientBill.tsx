import { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon } from '@core/design-system/components';
import type { WidgetProps } from '@core/feature-registry/ui';
import { palette, radius } from '@core/design-system/tokens';
import { SAMPLE_BILLS } from '../demo/samples';
import { BillCamera } from './BillCamera';
import { chooseImageWeb, type Frame } from './image';
import { patientError, patientMessage, summaryLine, tableRows, type PatientScan } from './model';

const BASE = '/api/bill-reader';
type Step = 'closed' | 'choose' | 'camera' | 'reading' | 'result';

/** The three-row table: what it is, how much, pay by. Big text, one fact per row. */
function BillTable({ scan }: { scan: PatientScan }) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
      {tableRows(scan).map((r) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: palette.border,
          }}
        >
          <View style={{ width: 140 }}>
            <AppText tone="muted" bold>
              {r.label}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <AppText bold>{r.value}</AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Patient: "Scan bill" (outlined, so the reminder keeps the ONE primary action). Take a picture, choose one
 * (web) or, in the demo, pick a sample bill. The answer is a three-row table in very simple words. It never says
 * "pay it": a bill with scam warning signs says "please don't pay this yet" and the caregiver is told.
 */
export function PatientBill({ collapsed = false }: WidgetProps) {
  const { api, demo } = useSession();
  const [step, setStep] = useState<Step>('closed');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [scan, setScan] = useState<PatientScan | null>(null);

  const send = async (frames: Frame[]) => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    setStep('reading');
    try {
      const r = await api<{ scan: PatientScan }>('POST', `${BASE}/scans`, { frames });
      setScan(r.scan);
      setStep('result');
    } catch (e) {
      setProblem(patientError(e instanceof ApiError ? e.code : 'offline'));
      setStep('choose');
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    if (busy) return;
    setProblem('');
    try {
      const frame = await chooseImageWeb();
      if (frame) await send([frame]);
    } catch {
      setProblem(patientError('bad_image'));
    }
  };

  const done = () => {
    setScan(null);
    setProblem('');
    setStep('closed');
  };

  if (collapsed) return null;

  return (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 }}>
      {step === 'closed' ? (
        // A paler blue than the shell's "Before I pay" button, so it reads as one of its options.
        <View style={{ backgroundColor: '#EDF4FC', borderRadius: radius.md }}>
          <BigButton tone="ghost" label="Scan bill" onPress={() => setStep('choose')} />
        </View>
      ) : null}

      {step === 'choose' ? (
        <Card>
          <AppText variant="title">Show me the bill</AppText>
          <BigButton label="Take a picture" onPress={() => setStep('camera')} />
          {Platform.OS === 'web' ? (
            <BigButton tone="ghost" label="Choose a picture" busy={busy} onPress={choose} />
          ) : null}
          {demo ? (
            <View style={{ gap: 8 }}>
              <AppText tone="muted">Or pick a sample bill (demo):</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {SAMPLE_BILLS.map((s) => (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Sample: ${s.label}`}
                    onPress={() => void send([{ mediaType: s.mediaType, data: s.data }])}
                    style={{ width: 130, gap: 6, alignItems: 'center' }}
                  >
                    <Image
                      source={{ uri: `data:${s.mediaType};base64,${s.data}` }}
                      style={{
                        width: 130,
                        height: 169,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: palette.border,
                      }}
                    />
                    <AppText variant="small" center>
                      {s.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <BigButton tone="ghost" label="Never mind" onPress={done} />
        </Card>
      ) : null}

      {step === 'camera' ? (
        <BillCamera onPicture={(f) => send([f])} onBack={() => setStep('choose')} />
      ) : null}

      {step === 'reading' ? (
        <Card>
          <AppText variant="title" center>
            Reading your bill…
          </AppText>
          <AppText center tone="muted">
            One moment.
          </AppText>
        </Card>
      ) : null}

      {step === 'result' && scan
        ? (() => {
            const msg = patientMessage(scan);
            const tone =
              scan.outcome === 'flagged'
                ? 'danger'
                : scan.outcome === 'unclear'
                  ? 'warn'
                  : 'neutral';
            return (
              <Card tone={tone}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Icon
                    name={scan.outcome === 'read' ? 'check' : 'alert'}
                    size={44}
                    color={
                      scan.outcome === 'flagged'
                        ? palette.danger
                        : scan.outcome === 'unclear'
                          ? palette.warn
                          : palette.primary
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="title">{msg.title}</AppText>
                  </View>
                </View>
                {scan.outcome !== 'unclear' ? <BillTable scan={scan} /> : null}
                {scan.outcome === 'read' ? <AppText>{summaryLine(scan)}</AppText> : null}
                <AppText tone="muted">{msg.body}</AppText>
                <BigButton tone="ghost" label="Done" onPress={done} />
                {scan.outcome === 'unclear' ? (
                  <BigButton label="Try again" onPress={() => setStep('choose')} />
                ) : null}
              </Card>
            );
          })()
        : null}

      {problem && step !== 'result' ? (
        <Card tone="danger">
          <AppText center>{problem}</AppText>
        </Card>
      ) : null}
    </View>
  );
}
