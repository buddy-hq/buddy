import type { SkillServiceErrorCode } from "../learning/skill-management"

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const

export const SKILL_ROUTE_ERRORS = {
  fallback: "Skill request failed",
  invalidSkillPayload: "Invalid skill payload",
  invalidSkillState: "Invalid skill state",
  invalidSkillsSettingsPayload: "Invalid skills settings payload",
} as const

export const SKILL_ROUTE_QUERY = {
  refreshParam: "refresh",
  refreshValues: new Set(["1", "true"]),
} as const

export const SKILL_ROUTE_ACTIONS = {
  whenEnabled: "ask",
  whenDisabled: "deny",
} as const

export const SKILL_ROUTE_CONFIG = {
  externalVendorRootsEnabledKey: "skills_external_vendor_roots_enabled",
} as const

type SkillErrorStatusMap = Partial<Record<SkillServiceErrorCode, number>>

export const SKILL_ERROR_STATUS = {
  create: {
    conflict: HTTP_STATUS.CONFLICT,
    invalid_input: HTTP_STATUS.BAD_REQUEST,
  } satisfies SkillErrorStatusMap,
  installLibrary: {
    not_found: HTTP_STATUS.NOT_FOUND,
    invalid_input: HTTP_STATUS.BAD_REQUEST,
    conflict: HTTP_STATUS.CONFLICT,
  } satisfies SkillErrorStatusMap,
  byName: {
    not_found: HTTP_STATUS.NOT_FOUND,
  } satisfies SkillErrorStatusMap,
} as const
