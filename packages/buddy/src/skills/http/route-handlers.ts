import type { Context } from "hono"
import {
  createSkill,
  installLibrarySkill,
  loadSkillsCatalog,
  parseCreateSkillPayload,
  parseToggleSkillPayload,
  removeSkill,
  resolveSkillAction,
  shouldRefreshSkillCatalog,
  updateSkill,
} from "../orchestration/skill-operations.js"
import { withJsonBody } from "../../http/route-helpers.js"
import { resolveDirectoryRequestContext } from "../../http/directory.js"

function resolveSkillsContext(c: Context): { directory: string; requestURL: URL } | Response {
  const contextResult = resolveDirectoryRequestContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response
  return contextResult.context
}

async function listSkillsHandler(c: Context): Promise<Response> {
  const context = resolveSkillsContext(c)
  if (context instanceof Response) return context

  const catalogResult = await loadSkillsCatalog({
    directory: context.directory,
    refresh: shouldRefreshSkillCatalog(context.requestURL.toString()),
  })
  if (!catalogResult.ok) {
    return c.json({ error: catalogResult.error }, catalogResult.status)
  }
  return c.json(catalogResult.catalog)
}

async function createSkillHandler(c: Context): Promise<Response> {
  const context = resolveSkillsContext(c)
  if (context instanceof Response) return context

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = parseCreateSkillPayload(bodyResult.value)
  if (!parsed.success) {
    return c.json({ error: "Invalid skill payload" }, 400)
  }

  const createResult = await createSkill({
    directory: context.directory,
    payload: parsed.data,
  })
  if (!createResult.ok) {
    return c.json({ error: createResult.error }, createResult.status)
  }
  return c.json({ ok: true, name: createResult.name })
}

async function installLibrarySkillHandler(c: Context): Promise<Response> {
  const context = resolveSkillsContext(c)
  if (context instanceof Response) return context

  const installResult = await installLibrarySkill({
    directory: context.directory,
    skillID: c.req.param("skillID"),
  })
  if (!installResult.ok) {
    return c.json({ error: installResult.error }, installResult.status)
  }
  return c.json({ ok: true, name: installResult.name })
}

async function updateSkillHandler(c: Context): Promise<Response> {
  const context = resolveSkillsContext(c)
  if (context instanceof Response) return context

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = parseToggleSkillPayload(bodyResult.value)
  if (!parsed.success) {
    return c.json({ error: "Invalid skill state" }, 400)
  }

  const updateResult = await updateSkill({
    directory: context.directory,
    name: c.req.param("name"),
    action: resolveSkillAction(parsed.data),
  })
  if (!updateResult.ok) {
    return c.json({ error: updateResult.error }, updateResult.status)
  }
  return c.json({ ok: true, skill: updateResult.skill, action: updateResult.action })
}

async function removeSkillHandler(c: Context): Promise<Response> {
  const context = resolveSkillsContext(c)
  if (context instanceof Response) return context

  const removeResult = await removeSkill({
    directory: context.directory,
    name: c.req.param("name"),
  })
  if (!removeResult.ok) {
    return c.json({ error: removeResult.error }, removeResult.status)
  }
  return c.json({ ok: true, name: removeResult.name })
}

export {
  createSkillHandler,
  installLibrarySkillHandler,
  listSkillsHandler,
  removeSkillHandler,
  updateSkillHandler,
}
