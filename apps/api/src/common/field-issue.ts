/**
 * One field-level issue carried in `details.fields[]` of a 400 `VALIDATION_FAILED`
 * response (`components.schemas.Error.details.fields`).
 *
 * `code` is a short machine token the client may localise against; it never
 * contains a Korean sentence, because `message` already is the user-facing text.
 */
export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}
