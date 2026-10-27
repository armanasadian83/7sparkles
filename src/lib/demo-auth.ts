/**
 * Browser-only sign-in preview. This session is a UI preference, not authentication.
 * Replace challenge creation and verification with server endpoints for SMS sign-in.
 */
export const DEMO_SESSION_KEY = "seven-sparkles-demo-session-v1";
export const DEMO_SESSION_EVENT = "seven-sparkles-demo-session";
export const OTP_LIFETIME_MS = 120_000;
export const OTP_RESEND_DELAY_MS = 30_000;

export type DemoSession = {
  mode: "demo";
  phone: string;
  signedInAt: string;
};

export type DemoChallenge = {
  code: string;
  expiresAt: number;
  resendAt: number;
};

let cachedSerialized: string | null = null;
let cachedSession: DemoSession | null = null;

export function normalizeDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  });
}

export function normalizePhone(value: string) {
  return normalizeDigits(value).replace(/[\s()-]/g, "");
}

export function isIranianMobile(value: string) {
  return /^09\d{9}$/.test(normalizePhone(value));
}

export function createDemoChallenge(previousCode?: string): DemoChallenge {
  let code: string;

  // Rejection sampling keeps all six-digit strings equally likely.
  do {
    const random = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(random);
    } while (random[0] >= 4_294_000_000);
    code = String(random[0] % 1_000_000).padStart(6, "0");
  } while (code === previousCode);

  const now = Date.now();
  return {
    code,
    expiresAt: now + OTP_LIFETIME_MS,
    resendAt: now + OTP_RESEND_DELAY_MS,
  };
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.localStorage.getItem(DEMO_SESSION_KEY);
    if (serialized === cachedSerialized) return cachedSession;
    cachedSerialized = serialized;
    cachedSession = null;
    const stored: unknown = JSON.parse(serialized ?? "null");
    if (!stored || typeof stored !== "object") return cachedSession;
    const session = stored as Partial<DemoSession>;
    cachedSession = session.mode === "demo" &&
      typeof session.phone === "string" &&
      isIranianMobile(session.phone) &&
      typeof session.signedInAt === "string" &&
      Number.isFinite(Date.parse(session.signedInAt))
      ? (session as DemoSession)
      : null;
    return cachedSession;
  } catch {
    return null;
  }
}

export function subscribeDemoSession(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEMO_SESSION_KEY || event.key === null) listener();
  };
  window.addEventListener(DEMO_SESSION_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DEMO_SESSION_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getDemoSessionServerSnapshot() {
  return null;
}

export function saveDemoSession(phone: string): boolean {
  if (typeof window === "undefined" || !isIranianMobile(phone)) return false;
  const session: DemoSession = {
    mode: "demo",
    phone: normalizePhone(phone),
    signedInAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
  } catch {
    // The sign-in preview remains usable when browser storage is unavailable.
  }
}
