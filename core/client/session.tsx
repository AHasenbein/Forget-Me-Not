import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@contracts/circle';
import { TextScaleContext } from '../design-system/text-scale';
import { isDemo } from '../config/data-mode';
import { apiCall, type ApiFn } from './api';

/** Demo personas map to the demo tokens the API accepts in demo mode. */
export const PERSONAS = [
  { id: 'patient', label: 'Patient', role: 'patient' },
  { id: 'caregiver', label: 'Caregiver', role: 'primary_caregiver' },
  { id: 'daughter', label: 'Daughter', role: 'circle_member' },
  { id: 'friend', label: 'Friend', role: 'circle_member' },
] as const satisfies readonly { id: string; label: string; role: Role }[];
export type Persona = (typeof PERSONAS)[number]['id'];

export const TEXT_SIZES = [
  { label: 'Normal', scale: 1 },
  { label: 'Large', scale: 1.25 },
  { label: 'Extra large', scale: 1.5 },
] as const;

interface Session {
  demo: boolean;
  persona: Persona;
  role: Role;
  token: string | null;
  setPersona(p: Persona): void;
  textScale: number;
  setTextScale(s: number): void;
  api: ApiFn;
}
const Ctx = createContext<Session | null>(null);

async function load(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null; // private window / blocked storage: just don't remember
  }
}
const save = (key: string, value: string) =>
  void AsyncStorage.setItem(key, value).catch(() => undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(() => isDemo(), []);
  const [persona, setPersonaState] = useState<Persona>('caregiver');
  const [textScale, setScaleState] = useState(1);

  useEffect(() => {
    void load('fmn.persona').then(
      (p) => PERSONAS.some((x) => x.id === p) && setPersonaState(p as Persona),
    );
    void load('fmn.textScale').then(
      (v) => TEXT_SIZES.some((x) => String(x.scale) === v) && setScaleState(Number(v)),
    );
  }, []);

  const setPersona = useCallback((p: Persona) => {
    setPersonaState(p);
    save('fmn.persona', p);
  }, []);
  const setTextScale = useCallback((v: number) => {
    setScaleState(v);
    save('fmn.textScale', String(v));
  }, []);

  // Live sign-in (Supabase) arrives in Stage 2: until then live mode has no token.
  const token = demo ? `demo:${persona}` : null;
  const role = PERSONAS.find((p) => p.id === persona)!.role;
  const api = useCallback<ApiFn>(
    (method, path, body) => apiCall(token, method, path, body),
    [token],
  );
  const value = useMemo(
    () => ({ demo, persona, role, token, setPersona, textScale, setTextScale, api }),
    [demo, persona, role, token, setPersona, textScale, setTextScale, api],
  );
  return (
    <Ctx.Provider value={value}>
      <TextScaleContext.Provider value={textScale}>{children}</TextScaleContext.Provider>
    </Ctx.Provider>
  );
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
