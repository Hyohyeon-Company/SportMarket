import { Module } from "@nestjs/common";

import { AUTH_DEPENDENCIES, AUTH_MAILER, CLOCK, ONE_TIME_TOKEN_REPOSITORY, PASSWORD_HASHER, RATE_LIMITER, SESSION_REPOSITORY, TOKEN_GENERATOR, USER_REPOSITORY } from "./auth.tokens";
import { SystemClock } from "./adapters/clock";
import { CryptoTokenGenerator } from "./adapters/crypto-token-generator";
import { InMemoryAuthMailer } from "./adapters/in-memory/in-memory-auth-mailer";
import { InMemoryOneTimeTokenRepository } from "./adapters/in-memory/in-memory-one-time-token.repository";
import { InMemoryRateLimiter } from "./adapters/in-memory/in-memory-rate-limiter";
import { InMemorySessionRepository } from "./adapters/in-memory/in-memory-session.repository";
import { InMemoryUserRepository } from "./adapters/in-memory/in-memory-user.repository";
import { ScryptPasswordHasher } from "./adapters/scrypt-password-hasher";
import { AuthService, type AuthServiceDeps } from "./application/auth.service";
import type {
  AuthMailer,
  Clock,
  OneTimeTokenRepository,
  PasswordHasher,
  RateLimiter,
  SessionRepository,
  TokenGenerator,
  UserRepository,
} from "./ports/auth-ports";
import { AuthController } from "./presentation/auth.controller";

/**
 * Auth module wiring.
 *
 * Every port is bound to an adapter here and nowhere else, which is what makes
 * the persistence card a one-line change per port: swap the `useClass` and the
 * application layer keeps working.
 *
 * The in-memory adapters are the temporary binding for this card: there is no
 * database connection or migration yet, and the card explicitly excludes them.
 * They are process-local, so a restart drops accounts and sessions — acceptable
 * only until the MySQL adapter lands, and stated in the PR body rather than hidden.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: AUTH_DEPENDENCIES,
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, ONE_TIME_TOKEN_REPOSITORY, PASSWORD_HASHER, TOKEN_GENERATOR, CLOCK, RATE_LIMITER, AUTH_MAILER],
      useFactory: (
        users: UserRepository,
        sessions: SessionRepository,
        tokens: OneTimeTokenRepository,
        hasher: PasswordHasher,
        tokenGenerator: TokenGenerator,
        clock: Clock,
        rateLimiter: RateLimiter,
        mailer: AuthMailer,
      ): AuthServiceDeps => ({ users, sessions, tokens, hasher, tokenGenerator, clock, rateLimiter, mailer }),
    },
    { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
    { provide: SESSION_REPOSITORY, useClass: InMemorySessionRepository },
    { provide: ONE_TIME_TOKEN_REPOSITORY, useClass: InMemoryOneTimeTokenRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
    { provide: CLOCK, useClass: SystemClock },
    { provide: RATE_LIMITER, useClass: InMemoryRateLimiter },
    { provide: AUTH_MAILER, useClass: InMemoryAuthMailer },
  ],
  exports: [AuthService],
})
export class AuthModule {}
