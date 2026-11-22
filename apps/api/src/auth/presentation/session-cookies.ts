import { AUTH_POLICY } from "../domain/auth-policy";

export interface CookieSpec {
  name: string;
  value: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
  path: string;
}

/**
 * Cookie construction, deliberately a pure function.
 *
 * The transport layer only serialises what this returns, so the cookie rules —
 * `httpOnly` on the session, a readable CSRF cookie, `SameSite=Lax`, `Secure` —
 * are testable without an HTTP server. The CSRF value must be readable by the SPA
 * to be echoed in `X-CSRF-Token`; the session value must not be readable by script.
 */
export function sessionCookieSpecs(
  issued: { sessionToken: string; csrfToken: string; expiresAt: Date },
  options: { secure: boolean; now: Date },
): CookieSpec[] {
  const maxAgeSeconds = Math.max(1, Math.floor((issued.expiresAt.getTime() - options.now.getTime()) / 1000));
  return [
    {
      name: AUTH_POLICY.cookies.session,
      value: issued.sessionToken,
      maxAgeSeconds,
      httpOnly: true,
      secure: options.secure,
      sameSite: "Lax",
      path: "/",
    },
    {
      name: AUTH_POLICY.cookies.csrf,
      value: issued.csrfToken,
      maxAgeSeconds,
      httpOnly: false,
      secure: options.secure,
      sameSite: "Lax",
      path: "/",
    },
  ];
}

/** Logout and failed-session responses expire both cookies with an empty value. */
export function clearedCookieSpecs(options: { secure: boolean }): CookieSpec[] {
  return [
    {
      name: AUTH_POLICY.cookies.session,
      value: "",
      maxAgeSeconds: 0,
      httpOnly: true,
      secure: options.secure,
      sameSite: "Lax",
      path: "/",
    },
    {
      name: AUTH_POLICY.cookies.csrf,
      value: "",
      maxAgeSeconds: 0,
      httpOnly: false,
      secure: options.secure,
      sameSite: "Lax",
      path: "/",
    },
  ];
}

export function serialiseCookie(spec: CookieSpec): string {
  const parts = [`${spec.name}=${spec.value}`, `Path=${spec.path}`, `Max-Age=${spec.maxAgeSeconds}`, `SameSite=${spec.sameSite}`];
  if (spec.httpOnly) {
    parts.push("HttpOnly");
  }
  if (spec.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** `Set-Cookie` takes one header line per cookie, so the response sets an array. */
export function serialiseCookieHeaders(specs: CookieSpec[]): string[] {
  return specs.map(serialiseCookie);
}

/**
 * Reads one cookie from the raw `Cookie` header.
 *
 * Parsed by hand instead of adding `cookie-parser`: the header format is a simple
 * `name=value; …` list and the only values this module reads are its own two.
 */
export function readCookie(headerValue: string | undefined, name: string): string | null {
  if (headerValue === undefined || headerValue === "") {
    return null;
  }
  for (const part of headerValue.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

/**
 * `Secure` is on by default because the contract requires it; it can be switched
 * off only for a local HTTP run (`SESSION_COOKIE_SECURE=false`), and that switch is
 * explicit so a production misconfiguration is a deliberate act rather than a
 * side effect of running on http.
 */
export function cookiesSecureFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SESSION_COOKIE_SECURE !== "false";
}

/**
 * Normalises a possibly repeated header value. Node types `Cookie` and a custom
 * header as `string | string[] | undefined`, and a repeated header must never be
 * silently ignored when the value decides access.
 */
export function headerValue(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) {
    return raw.join("; ");
  }
  return raw;
}
