import { useContext, useRef, useState, type ReactNode } from 'react';
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
import { font, palette, patientUi, radius, type IconName, type Tone } from './tokens';

/** Multiplier from Settings > Text size, the density (patient vs caregiver) and column fill. Provided by the shell. */
import { FillContext, useDensity, useTextScale } from './text-scale';

type Variant = 'huge' | 'title' | 'body' | 'small';
const SIZE: Record<Variant, number> = { huge: 40, title: 30, body: 24, small: 18 };
/** Caregiver (standard density): an ordinary app type scale. Text size never applies here. */
const STANDARD_SIZE: Record<Variant, number> = { huge: 28, title: 18, body: 15, small: 13 };
const useStandard = () => useDensity() === 'standard';

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
  const standard = useStandard();
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
  const display = variant === 'huge' || variant === 'title';
  // Headlines stop growing at 1.25x: at 1.5x a 40px title swallows a phone screen.
  const size = standard
    ? STANDARD_SIZE[variant]
    : SIZE[variant] * (display ? Math.min(scale, 1.25) : scale);
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: Math.round(
          size * (display ? (standard ? 1.25 : 1.15) : standard ? 1.45 : 1.35),
        ),
        color,
        ...(display ? font.display : bold ? font.bold : font.body),
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

/** One per screen: flat deep green, serif headline, white text. No decoration. */
export function Hero({ children }: { children: ReactNode }) {
  const tight = Math.min(useTextScale(), 1);
  return <View style={[s.hero, { padding: 28 * tight, gap: 20 * tight }]}>{children}</View>;
}

const BG: Record<Tone, string> = {
  neutral: palette.card,
  primary: palette.primaryBg,
  success: palette.successBg,
  warn: palette.warnBg,
  danger: palette.dangerBg,
};
const RULE: Record<Tone, string> = {
  neutral: palette.border,
  primary: palette.primary,
  success: palette.success,
  warn: palette.warn,
  danger: palette.danger,
};

/** Flat surface with a hairline. Meaning is carried by a coloured left rule, not by a tinted outline. */
export function Card({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const standard = useStandard();
  const fill = useContext(FillContext);
  return (
    <View
      style={[
        s.card,
        fill && { flexGrow: 1 },
        {
          padding: standard ? 16 : 24,
          gap: standard ? 10 : 16,
          backgroundColor: BG[tone],
          borderLeftColor: RULE[tone],
          borderLeftWidth: tone === 'neutral' ? 1 : 6,
        },
      ]}
    >
      <FillContext.Provider value={false}>{children}</FillContext.Provider>
    </View>
  );
}

/** Status tag: a dot and a word, no pill container. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const color = tone === 'neutral' ? palette.muted : palette[tone];
  const standard = useStandard();
  return (
    <View style={s.badge}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={{ color, ...font.bold, fontSize: standard ? 13 : 16 }}>{label}</Text>
    </View>
  );
}

/**
 * Touch target >= 64px (`huge` = 128px). While `busy`/`disabled` it ignores presses, and it also drops
 * repeated taps within 700ms: confused or tremoring users tap again and again.
 * In `standard` density (caregiver) it is an ordinary 44px button sized to its label.
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
  const standard = useStandard();
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
        standard && s.buttonStandard,
        {
          minHeight: standard
            ? 44 // ordinary app size, still a comfortable phone target
            : size === 'huge'
              ? 128
              : Math.max(patientUi.minTouchTarget, 72),
          backgroundColor: solid ? base : 'transparent',
          borderColor: solid ? base : palette.borderStrong,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: standard ? 15 : (size === 'huge' ? 38 : patientUi.minFontSize) * scale,
          ...font.bold,
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
  const standard = useStandard();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        standard && s.chipStandard,
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
          ...font.bold,
          fontSize: standard ? 14 : 18,
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
  const standard = useStandard();
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
        style={[
          s.input,
          standard && s.inputStandard,
          { borderColor: focus ? palette.primary : palette.inputBorder },
        ]}
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

/**
 * Line icon image (tinted) or the full-colour brand flower. Decorative: always sits next to a text label.
 * Sizes are given for the patient UI; standard density (caregiver) draws them at about 60% to match its smaller text.
 */
export function Icon({
  name,
  size = 24,
  color = palette.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const px = useStandard() ? Math.max(16, Math.round(size * 0.6)) : size;
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={ICONS[name]}
      style={[{ width: px, height: px }, name !== 'flower' && { tintColor: color }]}
    />
  );
}

/** A plain tinted icon (no circle, no badge): the icon colour carries the tone. Kept under its old name for callers. */
export function IconCircle({
  icon,
  size = 56,
  tone = 'primary',
}: {
  icon: IconName;
  size?: number;
  tone?: Tone;
}) {
  const color = tone === 'neutral' || tone === 'primary' ? palette.primary : palette[tone];
  return <Icon name={icon} size={size} color={color} />;
}

/** Section tabs: text with an underline on the selected one. One is always selected. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const standard = useStandard();
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[
              s.tab,
              standard && { minHeight: 44, paddingHorizontal: 10 },
              { borderBottomColor: on ? palette.primary : 'transparent' },
            ]}
          >
            <Text
              style={{
                fontSize: standard ? 14 : 18,
                ...font.bold,
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

/** "3 of 5 done": one short bar segment per reminder. Plain Views, no native deps. */
export function ProgressDots({
  done,
  total,
  inverse,
}: {
  done: number;
  total: number;
  inverse?: boolean;
}) {
  const on = inverse ? palette.sunflower : palette.success;
  const off = inverse ? 'rgba(255,255,255,0.28)' : palette.border;
  return (
    <View
      accessible
      accessibilityLabel={`${done} of ${total} done today`}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            maxWidth: 64,
            height: 8,
            borderRadius: 2,
            backgroundColor: i < done ? on : off,
          }}
        />
      ))}
    </View>
  );
}

/** Row of big numbers separated by hairlines (reads like a ledger, not a set of cards). */
export function Ledger({
  items,
  inverse,
}: {
  items: readonly { value: number; label: string; tone?: Tone }[];
  inverse?: boolean;
}) {
  const scale = useTextScale();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: inverse ? 'rgba(255,255,255,0.28)' : palette.border,
        paddingTop: 16,
      }}
    >
      {items.map((it, i) => (
        <View
          key={it.label}
          style={{
            flex: 1,
            gap: 2,
            paddingLeft: i === 0 ? 0 : 16,
            borderLeftWidth: i === 0 ? 0 : 1,
            borderLeftColor: inverse ? 'rgba(255,255,255,0.28)' : palette.border,
          }}
        >
          <Text
            style={{
              ...font.display,
              fontSize: 40 * Math.min(scale, 1.25),
              color: inverse
                ? it.tone === 'danger'
                  ? '#FFB4BF'
                  : '#FFFFFF'
                : it.tone && it.tone !== 'neutral'
                  ? palette[it.tone]
                  : palette.text,
            }}
          >
            {it.value}
          </Text>
          <Text
            style={{
              ...font.body,
              fontSize: 16 * scale,
              color: inverse ? '#D4E8DF' : palette.muted,
            }}
          >
            {it.label}
          </Text>
        </View>
      ))}
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
  screen: { padding: 20, alignItems: 'center', flexGrow: 1, paddingBottom: 56 },
  column: { width: '100%', maxWidth: 720, gap: 24 },
  hero: {
    backgroundColor: palette.hero,
    borderRadius: radius.md,
    padding: 28,
    gap: 20,
  },
  card: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    gap: 16,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonStandard: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 52,
    justifyContent: 'center',
  },
  chipStandard: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 36 },
  inputStandard: { borderWidth: 1.5, minHeight: 44, fontSize: 15, paddingHorizontal: 10 },
  input: {
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 60,
    fontSize: 22,
    ...font.body,
    backgroundColor: palette.card,
    color: palette.text,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    gap: 4,
  },
  tab: {
    minHeight: 52,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 3,
    marginBottom: -1,
  },
});
