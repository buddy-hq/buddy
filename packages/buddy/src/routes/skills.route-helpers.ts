import type { SkillServiceErrorCode } from '../learning/skills'
import { SkillServiceError } from '../learning/skills'
import {
  HTTP_STATUS,
  SKILL_ERROR_STATUS,
  SKILL_ROUTE_ACTIONS,
  SKILL_ROUTE_ERRORS,
  SKILL_ROUTE_QUERY,
} from './skills.constants'

type SkillToggleInput = {
  action?: 'allow' | 'deny' | 'ask' | 'inherit'
  enabled?: boolean
}

export function skillErrorMessage(error: unknown) {
  if (error instanceof SkillServiceError && error.message.trim()) {
    return error.message
  }
  return SKILL_ROUTE_ERRORS.fallback
}

function skillErrorStatus<TStatus extends number>(
  error: unknown,
  codeMap: Partial<Record<SkillServiceErrorCode, TStatus>>,
  defaultStatus: TStatus,
): TStatus {
  if (!(error instanceof SkillServiceError)) return HTTP_STATUS.INTERNAL_SERVER_ERROR as TStatus
  return codeMap[error.code] ?? defaultStatus
}

export function createSkillErrorStatus(error: unknown): 400 | 409 | 500 {
  return skillErrorStatus(error, SKILL_ERROR_STATUS.create, HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

export function installLibrarySkillErrorStatus(error: unknown): 400 | 404 | 409 | 500 {
  return skillErrorStatus(
    error,
    SKILL_ERROR_STATUS.installLibrary,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  )
}

export function notFoundSkillErrorStatus(error: unknown): 400 | 404 | 500 {
  return skillErrorStatus(error, SKILL_ERROR_STATUS.byName, HTTP_STATUS.BAD_REQUEST)
}

export function shouldRefreshSkillCatalog(refreshValue: string | undefined): boolean {
  if (!refreshValue) return false
  return SKILL_ROUTE_QUERY.refreshValues.has(refreshValue)
}

export function resolveSkillAction(input: SkillToggleInput) {
  return (
    input.action ??
    (input.enabled ? SKILL_ROUTE_ACTIONS.whenEnabled : SKILL_ROUTE_ACTIONS.whenDisabled)
  )
}
