import type { Context } from "hono"
import { Hono } from "hono"
import { patchProjectConfig } from "@buddy/backend/config/orchestration"
import {
  HTTP_STATUS,
  SKILL_ERROR_STATUS,
  SKILL_ROUTE_ACTIONS,
  SKILL_ROUTE_CONFIG,
  SKILL_ROUTE_ERRORS,
  SKILL_ROUTE_QUERY,
} from "./skills.constants"
import {
  createSkillRoute,
  installLibrarySkillRoute,
  listSkillsRoute,
  removeSkillRoute,
  updateSkillRoute,
  updateSkillsSettingsRoute,
} from "./skills.openapi"
import {
  createSkillBodySchema,
  skillsSettingsBodySchema,
  type ToggleSkillBody,
  toggleSkillBodySchema,
} from "./skills.schemas"
import { resolveDirectoryRequestContext, withJsonBody } from "../http"
import {
  createCustomSkill,
  installCuratedLibrarySkill,
  listSkillsCatalog,
  removeManagedSkill,
  setInstalledSkillAction,
  SkillServiceError,
  type SkillServiceErrorCode,
} from "../learning/skills/service"

type SkillsRouteContext = {
  directory: string
  requestURL: URL
}

function requireSkillsContext(c: Context): SkillsRouteContext | Response {
  const contextResult = resolveDirectoryRequestContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response
  return contextResult.context
}

function skillErrorMessage(error: unknown) {
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

function createSkillErrorStatus(error: unknown): 400 | 409 | 500 {
  return skillErrorStatus(error, SKILL_ERROR_STATUS.create, HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

function installLibrarySkillErrorStatus(error: unknown): 400 | 404 | 409 | 500 {
  return skillErrorStatus(error, SKILL_ERROR_STATUS.installLibrary, HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

function notFoundSkillErrorStatus(error: unknown): 400 | 404 | 500 {
  return skillErrorStatus(error, SKILL_ERROR_STATUS.byName, HTTP_STATUS.BAD_REQUEST)
}

function shouldRefreshSkillCatalog(requestURL: string): boolean {
  const refreshParam = new URL(requestURL).searchParams.get(SKILL_ROUTE_QUERY.refreshParam)
  return refreshParam !== null && SKILL_ROUTE_QUERY.refreshValues.has(refreshParam)
}

function resolveSkillAction(input: ToggleSkillBody) {
  return input.action ?? (input.enabled ? SKILL_ROUTE_ACTIONS.whenEnabled : SKILL_ROUTE_ACTIONS.whenDisabled)
}

function invalidPayload(c: Context, message: string) {
  return c.json({ error: message }, HTTP_STATUS.BAD_REQUEST)
}

async function listSkillsHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  try {
    const catalog = await listSkillsCatalog(context.directory, {
      refresh: shouldRefreshSkillCatalog(context.requestURL.toString()),
    })
    return c.json(catalog)
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

async function createSkillHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = createSkillBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return invalidPayload(c, SKILL_ROUTE_ERRORS.invalidSkillPayload)
  }

  try {
    const name = await createCustomSkill(parsed.data, context.directory)
    return c.json({ ok: true, name })
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, createSkillErrorStatus(error))
  }
}

async function installLibrarySkillHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  try {
    const name = await installCuratedLibrarySkill(c.req.param("skillID"), context.directory)
    return c.json({ ok: true, name })
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, installLibrarySkillErrorStatus(error))
  }
}

async function updateSkillHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = toggleSkillBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return invalidPayload(c, SKILL_ROUTE_ERRORS.invalidSkillState)
  }

  const action = resolveSkillAction(parsed.data)
  try {
    const skill = await setInstalledSkillAction(c.req.param("name"), action, context.directory)
    return c.json({ ok: true, skill, action })
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, notFoundSkillErrorStatus(error))
  }
}

async function updateSkillsSettingsHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = skillsSettingsBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return invalidPayload(c, SKILL_ROUTE_ERRORS.invalidSkillsSettingsPayload)
  }

  try {
    const config = await patchProjectConfig({
      directory: context.directory,
      payload: {
        [SKILL_ROUTE_CONFIG.externalVendorRootsEnabledKey]: parsed.data.externalVendorRootsEnabled,
      },
    })
    return c.json({
      ok: true,
      externalVendorRootsEnabled: config.skills_external_vendor_roots_enabled === true,
    })
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

async function removeSkillHandler(c: Context): Promise<Response> {
  const context = requireSkillsContext(c)
  if (context instanceof Response) return context

  try {
    const name = await removeManagedSkill(c.req.param("name"), context.directory)
    return c.json({ ok: true, name })
  } catch (error) {
    return c.json({ error: skillErrorMessage(error) }, notFoundSkillErrorStatus(error))
  }
}

export const SkillsRoutes = (): Hono =>
  new Hono()
    .get("/", listSkillsRoute, listSkillsHandler)
    .post("/", createSkillRoute, createSkillHandler)
    .post("/library/:skillID/install", installLibrarySkillRoute, installLibrarySkillHandler)
    .patch("/settings", updateSkillsSettingsRoute, updateSkillsSettingsHandler)
    .patch("/:name", updateSkillRoute, updateSkillHandler)
    .delete("/:name", removeSkillRoute, removeSkillHandler)
