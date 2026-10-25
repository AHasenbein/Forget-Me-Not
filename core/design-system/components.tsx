import { useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import icon_pill from './icons/pill.png';
import icon_toothbrush from './icons/toothbrush.png';
import icon_shower from './icons/shower.png';
import icon_paw from './icons/paw.png';
import icon_home from './icons/home.png';
import icon_sliders from './icons/sliders.png';
import icon_check from './icons/check.png';
import icon_alert from './icons/alert.png';
import icon_back from './icons/back.png';
import icon_camera from './icons/camera.png';
import icon_flower from './icons/flower.png';
import { palette, patientUi, radius, shadow, type IconName, type Tone } from './tokens';

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
  tone?: Tone | 'muted' | 'inverse' | 'inverseMuted';
  bold?: boolean;
  center?: boolean;
  children: ReactNode;
}) {
  const scale = useTextScale();
  const color =
    tone === 'inverse'
      ? '#FFFFFF'
      : tone === 'inverseMuted'
        ? '#D4E8DF'
        : tone === 'muted'
          ? palette.muted
          : tone && tone !== 'neutral'
            ? palette[tone]
            : palette.text;
  // Headlines stop growing at 1.25x: at 1.5x a 40px title swallows a phone screen.
  const size =
    SIZE[variant] * (variant === 'huge' || variant === 'title' ? Math.min(scale, 1.25) : scale);
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.3),
        color,
        fontWeight: bold || variant === 'huge' || variant === 'title' ? '700' : '400',
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </Text>
  );
}

export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={s.screen}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[s.column, wide && { maxWidth: 1120 }]}>{children}</View>
    </ScrollView>
  );
}

const BG: Record<Tone, string> = {
  neutral: palette.card,
  primary: palette.primaryBg,
  success: palette.successBg,
  warn: palette.warnBg,
  danger: palette.dangerBg,
};
const EDGE: Record<Tone, string> = {
  neutral: palette.border,
  primary: palette.primary,
  success: palette.success,
  warn: palette.warn,
  danger: palette.danger,
};

/** Brand hero panel: deep green, soft petals, white text. One per screen, carries the greeting/status. */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <View style={s.hero}>
      <View style={[s.petal, { width: 220, height: 220, right: -60, top: -80, opacity: 0.22 }]} />
      <View style={[s.petal, { width: 120, height: 120, right: 70, top: -50, opacity: 0.14 }]} />
      <View style={[s.sun, { right: 16, top: 16 }]} />
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

/** Soft raised surface. Tinted tones get a coloured edge so meaning never relies on colour fill alone. */
export function Card({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <View
      style={[
        s.card,
        shadow,
        {
          backgroundColor: BG[tone],
          borderColor: EDGE[tone],
          borderWidth: tone === 'neutral' ? 1 : 2,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const color = tone === 'neutral' ? palette.text : palette[tone];
  return (
    <View style={[s.badge, { backgroundColor: BG[tone], borderColor: EDGE[tone] }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={{ color, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </View>
  );
}

/**
 * Touch target >= 64px (`huge` = 128px). While `busy`/`disabled` it ignores presses, and it also drops
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
        solid ? shadow : null,
        {
          minHeight: size === 'huge' ? 128 : Math.max(patientUi.minTouchTarget, 72),
          backgroundColor: solid ? base : 'transparent',
          borderColor: solid ? base : palette.borderStrong,
          opacity: off ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <Text
        style={{
          fontSize: (size === 'huge' ? 38 : patientUi.minFontSize) * scale,
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
      style={({ pressed }) => [
        s.chip,
        {
          backgroundColor: selected ? palette.primary : palette.card,
          borderColor: palette.primary,
          opacity: pressed ? 0.8 : 1,
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
        placeholderTextColor={palette.muted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.input, { borderColor: focus ? palette.primary : palette.inputBorder }]}
      />
    </View>
  );
}

const ICONS: Record<IconName, number> = {
  pill: icon_pill,
  toothbrush: icon_toothbrush,
  shower: icon_shower,
  paw: icon_paw,
  home: icon_home,
  sliders: icon_sliders,
  check: icon_check,
  alert: icon_alert,
  back: icon_back,
  camera: icon_camera,
  flower: icon_flower,
};

/** Line icon image (tinted) or the full-colour brand flower. Decorative: always sits next to a text label. */
export function Icon({
  name,
  size = 24,
  color = palette.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={ICONS[name]}
      style={[{ width: size, height: size }, name !== 'flower' && { tintColor: color }]}
    />
  );
}

/** A familiar picture in a soft circle. Always sits next to a text label (pictures alone are ambiguous). */
export function IconCircle({
  icon,
  size = 56,
  tone = 'primary',
}: {
  icon: IconName;
  size?: number;
  tone?: Tone;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor:
          tone === 'neutral' ? palette.sunken : tone === 'primary' ? BG.primary : palette.card,
        borderWidth: tone === 'neutral' || tone === 'primary' ? 0 : 2,
        borderColor: EDGE[tone],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon
        name={icon}
        size={size * 0.52}
        color={tone === 'neutral' || tone === 'primary' ? palette.primary : palette[tone]}
      />
    </View>
  );
}

/** Segmented control for sections inside one screen (big, labelled, one always selected). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={s.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[s.segmentItem, on && { backgroundColor: palette.card }, on && shadow]}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: on ? palette.primary : palette.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "3 of 5 done" as dots, plain Views (no native deps). */
export function ProgressDots({
  done,
  total,
  inverse,
}: {
  done: number;
  total: number;
  inverse?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${done} of ${total} done today`}
      style={{
        flexDirection: 'row',
        gap: 8,
        justifyContent: inverse ? 'flex-start' : 'center',
        flexWrap: 'wrap',
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor:
              i < done ? (inverse ? palette.sunflower : palette.success) : 'transparent',
            borderWidth: 2,
            borderColor: inverse
              ? i < done
                ? palette.sunflower
                : '#D4E8DF'
              : i < done
                ? palette.success
                : palette.muted,
          }}
        />
      ))}
    </View>
  );
}

/** Big number + label for the caregiver summary row. */
export function StatTile({
  value,
  label,
  tone = 'neutral',
  inverse,
}: {
  value: number;
  label: string;
  tone?: Tone;
  inverse?: boolean;
}) {
  const scale = useTextScale();
  const color = inverse ? '#FFFFFF' : tone === 'neutral' ? palette.text : palette[tone];
  return (
    <View
      style={[
        s.stat,
        inverse
          ? {
              backgroundColor: tone === 'danger' ? palette.danger : palette.heroSoft,
              borderColor: 'transparent',
            }
          : { backgroundColor: BG[tone], borderColor: EDGE[tone] },
      ]}
    >
      <Text style={{ fontSize: 34 * scale, fontWeight: '800', color }}>{value}</Text>
      <Text
        style={{
          fontSize: 16 * scale,
          color: inverse ? '#E6F2EC' : palette.muted,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
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
  screen: { padding: 20, alignItems: 'center', flexGrow: 1, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 720, gap: 20 },
  card: { borderRadius: radius.lg, padding: 24, gap: 16 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 52,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 60,
    fontSize: 22,
    backgroundColor: palette.card,
    color: palette.text,
  },
  hero: {
    backgroundColor: palette.hero,
    borderRadius: radius.lg,
    padding: 28,
    overflow: 'hidden',
  },
  petal: { position: 'absolute', borderRadius: 999, backgroundColor: palette.petal },
  sun: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.sunflower,
    opacity: 0.9,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: palette.track,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md - 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 96,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
});
