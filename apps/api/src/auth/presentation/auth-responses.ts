import type { SessionSnapshot } from "../application/auth.service";
import type { RegionValue } from "../domain/profile";
import type { UserStatus } from "../domain/user-account";

/** `components.schemas.Session` with its `User` and `Profile` members. */
export interface SessionUserBody {
  id: string;
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionProfileBody {
  nickname: string;
  region: RegionValue | null;
  bio: string;
  joinedAt: string;
}

export interface SessionBody {
  authenticated: boolean;
  user: SessionUserBody | null;
  profile: SessionProfileBody | null;
  unreadNotifications?: number;
}

export interface AcceptedBody {
  accepted: true;
}

/**
 * Response mapping.
 *
 * `Session.user.email` is the owner-only field (AC-02-4: never in a public view),
 * and the session endpoint is the owner's own view, so it is present. Nothing here
 * can emit a token or a password hash because neither is reachable from the
 * aggregate's public surface.
 */
export function toSessionBody(snapshot: SessionSnapshot): SessionBody {
  const { session, user } = snapshot;
  if (session === null || user === null) {
    return { authenticated: false, user: null, profile: null };
  }
  const profile = user.profile;
  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email.value,
      status: user.status,
      emailVerified: user.isEmailVerified(),
      createdAt: user.createdAt.toISOString(),
    },
    profile: {
      nickname: profile.nickname,
      region: profile.region,
      bio: profile.bio,
      joinedAt: profile.joinedAt.toISOString(),
    },
  };
}

/** `components.schemas.Accepted` — the 202 shape for the mail-request endpoints. */
export function toAcceptedBody(): AcceptedBody {
  return { accepted: true };
}
