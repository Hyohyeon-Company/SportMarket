import { ApiError } from "../../common/api-error";
import type { FieldIssue } from "../../common/field-issue";

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;
export const BIO_MAX_LENGTH = 200;
export const REGION_SIDO_MAX_LENGTH = 20;
export const REGION_SIGUNGU_MAX_LENGTH = 30;
export const REGION_LABEL_MAX_LENGTH = 40;

/** Si/gun/gu only. The contract has no coordinates and no street address (AC-02-3). */
export interface RegionValue {
  sido: string;
  sigungu: string;
  label: string;
}

export function nicknameFieldIssues(value: unknown, path = "nickname"): FieldIssue[] {
  if (value === undefined || value === null || value === "") {
    return [{ path, code: "required", message: "닉네임을 입력해 주세요." }];
  }
  if (typeof value !== "string") {
    return [{ path, code: "type", message: "닉네임은 문자열이어야 합니다." }];
  }
  if (value.trim().length < NICKNAME_MIN_LENGTH) {
    return [{ path, code: "min_length", message: "닉네임은 2자 이상이어야 합니다." }];
  }
  if (value.length > NICKNAME_MAX_LENGTH) {
    return [{ path, code: "max_length", message: "닉네임은 20자 이내로 입력해 주세요." }];
  }
  if (!/\S/.test(value)) {
    return [{ path, code: "pattern", message: "닉네임에 공백이 아닌 문자를 포함해 주세요." }];
  }
  return [];
}

/**
 * Region is a value object, not an entity: two users in the same si/gun/gu hold
 * equal values. `null` means "not set yet" (S1 unset-region state), which the
 * contract models explicitly instead of an empty string.
 */
export class Region {
  private constructor(readonly value: RegionValue) {}

  static parse(raw: unknown, path = "region"): Region {
    const issues = regionFieldIssues(raw, path);
    if (issues.length > 0) {
      throw new ApiError("VALIDATION_FAILED", "입력값을 확인해 주세요.", { fields: issues });
    }
    const source = raw as RegionValue;
    return new Region({
      sido: source.sido.trim(),
      sigungu: source.sigungu.trim(),
      label: source.label.trim(),
    });
  }

  toValue(): RegionValue {
    return { ...this.value };
  }
}

export function regionFieldIssues(value: unknown, path = "region"): FieldIssue[] {
  if (value === undefined || value === null) {
    return [{ path, code: "required", message: "지역을 선택해 주세요." }];
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return [{ path, code: "type", message: "지역 형식이 올바르지 않습니다." }];
  }
  const record = value as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  const allowed = new Set(["sido", "sigungu", "label"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({ path: `${path}.${key}`, code: "unknown_field", message: "지역에는 시/도·시/군/구·표시명만 보낼 수 있습니다." });
    }
  }
  issues.push(
    ...cappedString(record.sido, `${path}.sido`, REGION_SIDO_MAX_LENGTH, "시/도를 선택해 주세요."),
    ...cappedString(record.sigungu, `${path}.sigungu`, REGION_SIGUNGU_MAX_LENGTH, "시/군/구를 선택해 주세요."),
    ...cappedString(record.label, `${path}.label`, REGION_LABEL_MAX_LENGTH, "지역 표시명을 입력해 주세요."),
  );
  return issues;
}

function cappedString(value: unknown, path: string, maxLength: number, requiredMessage: string): FieldIssue[] {
  if (value === undefined || value === null || value === "") {
    return [{ path, code: "required", message: requiredMessage }];
  }
  if (typeof value !== "string") {
    return [{ path, code: "type", message: "문자열이어야 합니다." }];
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return [{ path, code: "required", message: requiredMessage }];
  }
  if (trimmed.length > maxLength) {
    return [{ path, code: "max_length", message: `${maxLength}자 이내로 입력해 주세요.` }];
  }
  return [];
}
