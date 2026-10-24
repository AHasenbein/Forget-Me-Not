import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette, patientUi, type Tone } from './tokens';

/** Multiplier from Settings > Text size. Provided by the shell. */
import { useTextScale } from './text-scale';

type Variant = 'huge' | 'title' | 'body' | 'small';
const SIZE: Record<Variant, number> = { huge: 40, title: 30, body: 24, small: 18 };

export function AppText({
  variant = 'body',
  tone,
  bold,
  center,
  children,
}: {
  variant?: Variant;
  tone?: Tone | 'muted';
  bold?: boolean;
  center?: boolean;
  children: ReactNode;
}) {
  const scale = useTextScale();
  const color =
    tone === 'muted' ? palette.muted : tone && tone !== 'neutral' ? palette[tone] : palette.text;
  return (
    <Text
      style={{
        fontSize: SIZE[variant] * scale,
        color,
        fontWeight: bold || variant === 'huge' || variant === 'title' ? '700' : '400',
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </Text>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={s.screen}>
      <View style={s.column}>{children}</View>
    </ScrollView>
  );
}

const BG: Record<Tone, string> = {
  neutral: palette.card,
  primary: palette.card,
  success: palette.successBg,
  warn: palette.warnBg,
  danger: palette.dangerBg,
};

export function Card({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <View style={[s.card, { backgroundColor: BG[tone] }]}>{children}</View>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const color = tone === 'neutral' ? palette.text : palette[tone];
  return (
    <View style={[s.badge, { borderColor: color, backgroundColor: BG[tone] }]}>
      <Text style={{ color, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </View>
  );
}

/**
 * Touch target >= 64px (`huge` = 120px). While `busy`/`disabled` it ignores presses, and it also drops
 * repeated taps within 700ms: confused or tremoring users tap again and again.
 */
export function BigButton({
  label,
  onPress,
  tone = 'primary',
  size = 'normal',
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  tone?: Tone | 'ghost';
  size?: 'normal' | 'huge';
  busy?: boolean;
  disabled?: boolean;
}) {
  const scale = useTextScale();
  const last = useRef(0);
  const off = busy || disabled;
  const solid = tone === 'primary' || tone === 'success' || tone === 'danger';
  const base = tone === 'ghost' || tone === 'neutral' ? palette.text : palette[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        if (Date.now() - last.current < 700) return;
        last.current = Date.now();
        void onPress();
      }}
      style={({ pressed }) => [
        s.button,
        {
          minHeight: size === 'huge' ? 120 : patientUi.minTouchTarget,
          backgroundColor: solid ? base : palette.card,
          borderColor: base,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: (size === 'huge' ? 36 : patientUi.minFontSize) * scale,
          fontWeight: '700',
          color: solid ? palette.onPrimary : base,
          textAlign: 'center',
        }}
      >
        {busy ? 'Please wait…' : label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        s.chip,
        {
          backgroundColor: selected ? palette.primary : palette.card,
          borderColor: palette.primary,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? palette.onPrimary : palette.primary,
          fontWeight: '700',
          fontSize: 18,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.input, { borderColor: focus ? palette.primary : palette.border }]}
      />
    </View>
  );
}

export const Row = ({ children, gap = 12 }: { children: ReactNode; gap?: number }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>
    {children}
  </View>
);
export const Stack = ({ children, gap = 16 }: { children: ReactNode; gap?: number }) => (
  <View style={{ gap }}>{children}</View>
);

const s = StyleSheet.create({
  screen: { padding: 16, alignItems: 'center', flexGrow: 1 },
  column: { width: '100%', maxWidth: 720, gap: 16 },
  card: { borderWidth: 2, borderColor: palette.border, borderRadius: 20, padding: 20, gap: 16 },
  badge: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  button: {
    borderWidth: 3,
    borderRadius: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 56,
    fontSize: 20,
    backgroundColor: palette.card,
    color: palette.text,
  },
});
