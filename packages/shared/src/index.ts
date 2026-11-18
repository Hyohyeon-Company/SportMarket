/**
 * Type-only mirror of the pinned SportMarket API contract, version 1.
 *
 * Source of truth: the private team workspace pin `api-spec-pin/v1`
 * (spec `api-spec-v1.yaml`, sha256 e2984e4e5776fed59522ee5240c34619602c00322711a2d92dc92f123bbc13be,
 * verified pin `api-spec-v1.pin.json`). Schema names below match
 * `components.schemas` in that document so a reviewer can diff them.
 *
 * Only the summary shapes the first Backend/Frontend cards need are mirrored.
 * Request bodies, page envelopes and error-code specifics stay in the spec
 * until the card that implements them exists.
 *
 * This package intentionally contains no runtime code: every export is a type
 * or an interface, and the build emits declarations only.
 */

/* ------------------------------------------------------------------ *
 * Closed value sets (`components.schemas.*` string enums)
 * ------------------------------------------------------------------ */

/** 4 fixed categories; plan 6.1 `other` is merged into `barbell` (assumption A-01). */
export type CategoryCode = "dumbbell" | "plate" | "homegym" | "barbell";

/** Single 5-step condition grade (LD-05). Display wording is client-owned. */
export type ConditionGrade = "S" | "A" | "B" | "C" | "parts";

/** `sold` is reachable only through buyer confirmation. */
export type ListingStatus =
  | "draft"
  | "active"
  | "reserved"
  | "sold"
  | "hidden"
  | "removed";

/** 6 deal states (plan 6.5). */
export type DealStatus =
  | "requested"
  | "confirmed"
  | "unconfirmed"
  | "declined"
  | "cancelled"
  | "dismissed";

/** Button-visibility hints; the server re-checks permission on every request. */
export type DealAction =
  | "request_deal"
  | "confirm"
  | "decline"
  | "cancel"
  | "create_review";

/** Why chat input is locked. A removed listing is not a reason: chat continues. */
export type ReadOnlyReason =
  | "listing_sold"
  | "listing_hidden"
  | "blocked"
  | "counterpart_withdrawn"
  | "account_suspended";

export type ReportTargetType = "listing" | "user" | "message";

/** 6 report reasons (S11). No automatic sanction or deletion (LD-13). */
export type ReportReason = "fake" | "fraud" | "banned" | "abuse" | "spam" | "etc";

/** Viewing party's role in a conversation or deal. */
export type PartyRole = "buyer" | "seller";

/** Chat conversation state. */
export type ConversationState = "open" | "read_only" | "counterpart_withdrawn";

/* ------------------------------------------------------------------ *
 * Shared value objects
 * ------------------------------------------------------------------ */

/** Si/gun/gu region only. Never carries coordinates or a street address (AC-02-3). */
export interface Region {
  sido: string;
  sigungu: string;
  /** Ready-to-display combination, e.g. 성남시 분당구. */
  label: string;
}

/** One derived image size. `url` is a same-origin relative path under `/media/` (AC-04-6). */
export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/** Structured spec line shown on a card. "Unknown" is rendered as 판매자 미확인. */
export interface KeySpec {
  key: string;
  label: string;
  value: string;
}

/** Rating aggregate. `average` is `null` (not 0.0) when `count` is 0 (AC-09-2). */
export interface RatingSummary {
  average: number | null;
  count: number;
}

/** Minimum identity of the other party. Never includes email or exact location. */
export interface UserBrief {
  id: string;
  nickname: string;
}

/* ------------------------------------------------------------------ *
 * Listing summary (S1/S2 card, referenced by chat and deal)
 * ------------------------------------------------------------------ */

/** Listing summary embedded in other resources; `id` and `title` survive deletion. */
export interface ListingBrief {
  id: string;
  title: string;
  /** Won-unit integer. 만원 formatting is a client display rule (LD-08). */
  price: number;
  status: ListingStatus;
  thumbnail: ImageVariant | null;
}

/** Search/list card (AC-05-1, S2): at most three key specs. */
export interface ListingSummary {
  id: string;
  title: string;
  price: number;
  status: ListingStatus;
  region: Region;
  conditionGrade: ConditionGrade;
  thumbnail: ImageVariant | null;
  keySpecs: KeySpec[];
  publishedAt: string;
  seller?: UserBrief;
}

/* ------------------------------------------------------------------ *
 * Chat summary (S5 row)
 * ------------------------------------------------------------------ */

/** A persisted message. In-flight/failed states are client-owned and never stored. */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  clientMessageId: string;
}

/** S5 conversation row: counterpart, listing, last message, unread count, deal badge. */
export interface ConversationSummary {
  id: string;
  listing: ListingBrief;
  counterpart: UserBrief;
  /** My role in this conversation. */
  role: PartyRole;
  state: ConversationState;
  readOnlyReason?: ReadOnlyReason | null;
  lastMessage?: Message | null;
  unreadCount: number;
  /** Latest deal status badge for this conversation; `null` when no deal exists. */
  dealStatus?: DealStatus | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Deal summary (S7)
 * ------------------------------------------------------------------ */

/** Deal summary from the viewer's side, including server-decided actions. */
export interface DealSummary {
  id: string;
  listing: ListingBrief;
  buyer: UserBrief;
  seller: UserBrief;
  status: DealStatus;
  /** Restarts, and reopens the 7-day window, on re-request (plan 6.5). */
  requestedAt: string;
  /** requestedAt + 7 days: the moment the system moves the deal to `unconfirmed`. */
  expiresAt: string;
  confirmedAt?: string | null;
  closedAt?: string | null;
  closedReason?: string | null;
  viewerRole: PartyRole;
  permittedActions: DealAction[];
}

/* ------------------------------------------------------------------ *
 * Profile summary (S8, plus the owner's own profile)
 * ------------------------------------------------------------------ */

/** The authenticated user's profile. */
export interface Profile {
  nickname: string;
  /** `null` when the user has not set a region (S1 unset-region state). */
  region: Region | null;
  bio: string;
  joinedAt: string;
}

/** Public profile (S8). Never contains email (AC-02-4). */
export interface PublicProfile {
  id: string;
  nickname: string;
  bio: string;
  region: Region | null;
  joinedAt: string;
  rating: RatingSummary;
  /** Counts `confirmed` deals only; `unconfirmed` is excluded (AC-09-3). */
  dealConfirmedCount: number;
  receivedReviewCount: number;
}

/* ------------------------------------------------------------------ *
 * Report summary (S11)
 * ------------------------------------------------------------------ */

export interface Report {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  /** Operations-only transitions; there is no automatic sanction (plan 6.6). */
  status: "open" | "reviewed" | "dismissed";
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Error envelope (`components.schemas.Error`) — the single error shape
 * ------------------------------------------------------------------ */

/** One field-level validation issue carried in `details.fields`. */
export interface ApiErrorFieldIssue {
  path: string;
  code: string;
  message: string;
}

/** Extra context for a specific error code. Validation failures add `fields`. */
export interface ApiErrorDetails {
  fields?: ApiErrorFieldIssue[];
  [key: string]: unknown;
}

/**
 * Every error response. `code` is the stable machine branch (`^[A-Z][A-Z0-9_]*$`);
 * `message` is user-facing Korean and safe to render as-is.
 */
export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: ApiErrorDetails;
}
