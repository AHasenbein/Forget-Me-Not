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
import { apiCall, ApiError, type ApiFn } from './api';
import type { QuickAccount } from '../auth/quick-login';
import { authClient } from './supabase';

/** Demo personas map to the demo tokens the API accepts in demo mode. */
export const PERSONAS = [
  { id: 'patient', label: 'View as Margaret', role: 'patient' },
  { id: 'caregiver', label: 'View as caregiver', role: 'primary_caregiver' },
  // Circle members (daughter, friend) come back with the friends-family feature; their accounts and the
  // `demo:daughter` / `demo:friend` tokens still exist, they just have no screen to pick yet.
] as const satisfies readonly { id: string; label: string; role: Role }[];
export type Persona = (typeof PERSONAS)[number]['id'];

export const TEXT_SIZES = [
  { label: 'Normal', scale: 1 },
  { label: 'Large', scale: 1.25 },
  { label: 'Extra large', scale: 1.5 },
] as const;

/** Live mode: where we are in signing in. */
export type LiveStatus = 'loading' | 'signed_out' | 'no_access' | 'ready';

interface Session {
  demo: boolean;
  persona: Persona;
  /** Null in live mode until we know who you are. */
  role: Role | null;
  token: string | null;
  liveStatus: LiveStatus;
  email: string | null;
  setPersona(p: Persona): void;
  signIn(email: string, password: string): Promise<string | null>;
  /** Dev convenience: pick one of the seeded accounts (needs QUICK_LOGIN=on on the API and EXPO_PUBLIC_QUICK_LOGIN=on here). */
  quickLogin: boolean;
  signInAs(account: QuickAccount): Promise<string | null>;
  signOut(): Promise<void>;
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
  const [liveToken, setLiveToken] = useState<string | null | undefined>(undefined); // undefined = not loaded yet
  const [email, setEmail] = useState<string | null>(null);
  const [liveRole, setLiveRole] = useState<Role | null | undefined>(undefined); // undefined = unknown, null = no access

  useEffect(() => {
    void load('fmn.persona').then(
      (p) => PERSONAS.some((x) => x.id === p) && setPersonaState(p as Persona),
    );
    void load('fmn.textScale').then(
      (v) => TEXT_SIZES.some((x) => String(x.scale) === v) && setScaleState(Number(v)),
    );
  }, []);

  // Live: follow the Supabase session (it restores from storage and refreshes tokens by itself).
  useEffect(() => {
    if (demo) return;
    const auth = authClient().auth;
    void auth.getSession().then(({ data }) => {
      setLiveToken(data.session?.access_token ?? null);
      setEmail(data.session?.user.email ?? null);
    });
    const { data } = auth.onAuthStateChange((_event, s) => {
      setLiveToken(s?.access_token ?? null);
      setEmail(s?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [demo]);

  // Live: ask the API who we are. A valid login with no profile is "no access", not an error screen.
  useEffect(() => {
    if (demo || !liveToken) return setLiveRole(liveToken === null ? null : undefined);
    let alive = true;
    setLiveRole(undefined);
    apiCall<{ role: Role }>(liveToken, 'GET', '/api/me')
      .then((me) => alive && setLiveRole(me.role))
      .catch(
        (e) => alive && setLiveRole(e instanceof ApiError && e.status === 401 ? null : undefined),
      );
    return () => {
      alive = false;
    };
  }, [demo, liveToken]);

  const setPersona = useCallback((p: Persona) => {
    setPersonaState(p);
    save('fmn.persona', p);
  }, []);
  const setTextScale = useCallback((v: number) => {
    setScaleState(v);
    save('fmn.textScale', String(v));
  }, []);

  const token = demo ? `demo:${persona}` : (liveToken ?? null);
  const role = demo ? PERSONAS.find((p) => p.id === persona)!.role : (liveRole ?? null);
  const liveStatus: LiveStatus = demo
    ? 'ready'
    : liveToken === undefined
      ? 'loading'
      : liveToken === null
        ? 'signed_out'
        : liveRole === undefined
          ? 'loading'
          : liveRole === null
            ? 'no_access'
            : 'ready';

  const signIn = useCallback(async (e: string, password: string) => {
    const { error } = await authClient().auth.signInWithPassword({ email: e.trim(), password });
    return error ? 'That email or password isn’t right.' : null; // same message either way: no account hints
  }, []);
  const quickLogin = process.env.EXPO_PUBLIC_QUICK_LOGIN === 'on'; // literal access so Expo inlines it
  const signInAs = useCallback(async (account: QuickAccount) => {
    try {
      const s = await apiCall<{ access_token: string; refresh_token: string }>(
        null,
        'POST',
        '/dev/quick-login',
        { account },
      );
      const { error } = await authClient().auth.setSession(s);
      return error ? 'That didn’t work. Please try again.' : null;
    } catch (e) {
      return e instanceof ApiError && e.status === 404
        ? 'Quick sign-in is not turned on. Use email and password.'
        : 'I can’t reach the app right now. Please try again in a moment.';
    }
  }, []);
  const signOut = useCallback(async () => {
    try {
      // 'local' ends THIS device's session only (a global sign-out would also kick the same account out of
      // every other tab/phone, and it errors when the session was created by quick login).
      await authClient().auth.signOut({ scope: 'local' });
    } catch {
      /* clear our own state below regardless: the user asked to leave */
    }
    setLiveToken(null);
    setEmail(null);
  }, []);

  const api = useCallback<ApiFn>(
    (method, path, body) => apiCall(token, method, path, body),
    [token],
  );
  const value = useMemo(
    () => ({
      demo,
      persona,
      role,
      token,
      liveStatus,
      email,
      setPersona,
      signIn,
      quickLogin,
      signInAs,
      signOut,
      textScale,
      setTextScale,
      api,
    }),
    [
      demo,
      persona,
      role,
      token,
      liveStatus,
      email,
      setPersona,
      signIn,
      quickLogin,
      signInAs,
      signOut,
      textScale,
      setTextScale,
      api,
    ],
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
