import { SkillServiceError } from "../learning/skill-management"
import {
  HTTP_STATUS,
  SKILL_ERROR_STATUS,
  SKILL_ROUTE_ACTIONS,
  SKILL_ROUTE_ERRORS,
  SKILL_ROUTE_QUERY,
} from "./skills.constants"

type SkillToggleInput = {
  action?: "allow" | "deny"
  enabled?: boolean
}

export function skillErrorMessage<TError>(error: TError) {
  if (error instanceof SkillServiceError && error.message.trim()) {
    return error.message
  }
  return SKILL_ROUTE_ERRORS.fallback
}

export function createSkillErrorStatus<TError>(error: TError): 400 | 409 | 500 {
  if (!(error instanceof SkillServiceError)) return HTTP_STATUS.INTERNAL_SERVER_ERROR
  switch (error.code) {
    case "conflict":
      return SKILL_ERROR_STATUS.create.conflict
    case "invalid_input":
      return SKILL_ERROR_STATUS.create.invalid_input
    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR
  }
}

export function installLibrarySkillErrorStatus<TError>(error: TError): 400 | 403 | 404 | 409 | 500 {
  if (!(error instanceof SkillServiceError)) return HTTP_STATUS.INTERNAL_SERVER_ERROR
  switch (error.code) {
    case "not_found":
      return SKILL_ERROR_STATUS.installLibrary.not_found
    case "invalid_input":
      return SKILL_ERROR_STATUS.installLibrary.invalid_input
    case "conflict":
      return SKILL_ERROR_STATUS.installLibrary.conflict
    case "forbidden":
      return SKILL_ERROR_STATUS.installLibrary.forbidden
    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR
  }
}

export function notFoundSkillErrorStatus<TError>(error: TError): 400 | 403 | 404 | 500 {
  if (!(error instanceof SkillServiceError)) return HTTP_STATUS.INTERNAL_SERVER_ERROR
  switch (error.code) {
    case "forbidden":
      return SKILL_ERROR_STATUS.byName.forbidden
    case "not_found":
      return SKILL_ERROR_STATUS.byName.not_found
    default:
      return HTTP_STATUS.BAD_REQUEST
  }
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
