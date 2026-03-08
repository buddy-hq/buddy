import { z } from "zod"
import {
  createCustomSkill,
  installPlaceholderLibrarySkill,
  listSkillsCatalog,
  removeManagedSkill,
  SkillServiceError,
  setInstalledSkillAction,
} from "../../skills/service.js"

export const createSkillBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  examplePrompt: z.string().trim().optional(),
  content: z.string().trim().min(1),
})

export const toggleSkillBodySchema = z
  .object({
    action: z.enum(["allow", "deny", "ask", "inherit"]).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => value.action !== undefined || value.enabled !== undefined, {
    message: "action or enabled is required",
  })

export function skillErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return "Skill request failed"
}

export function shouldRefreshSkillCatalog(requestURL: string): boolean {
  const refreshParam = new URL(requestURL).searchParams.get("refresh")
  return refreshParam === "1" || refreshParam === "true"
}

export async function loadSkillsCatalog(input: {
  directory: string
  refresh: boolean
}): Promise<
  | {
      ok: true
      catalog: Awaited<ReturnType<typeof listSkillsCatalog>>
    }
  | {
      ok: false
      status: 500
      error: string
    }
> {
  try {
    const catalog = await listSkillsCatalog(input.directory, {
      refresh: input.refresh,
    })
    return {
      ok: true,
      catalog,
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: skillErrorMessage(error),
    }
  }
}

export function parseCreateSkillPayload(payload: unknown): ReturnType<typeof createSkillBodySchema.safeParse> {
  return createSkillBodySchema.safeParse(payload)
}

export async function createSkill(input: {
  directory: string
  payload: z.infer<typeof createSkillBodySchema>
}): Promise<
  | {
      ok: true
      name: string
    }
  | {
      ok: false
      status: 400 | 409 | 500
      error: string
    }
> {
  try {
    const name = await createCustomSkill(input.payload, input.directory)
    return {
      ok: true,
      name,
    }
  } catch (error) {
    const message = skillErrorMessage(error)
    const status = error instanceof SkillServiceError
      ? error.code === "conflict"
        ? 409
        : error.code === "invalid_input"
          ? 400
          : 500
      : 500
    return {
      ok: false,
      status,
      error: message,
    }
  }
}

export async function installLibrarySkill(input: {
  directory: string
  skillID: string
}): Promise<
  | {
      ok: true
      name: string
    }
  | {
      ok: false
      status: 400 | 404 | 409 | 500
      error: string
    }
> {
  try {
    const name = await installPlaceholderLibrarySkill(input.skillID, input.directory)
    return {
      ok: true,
      name,
    }
  } catch (error) {
    const message = skillErrorMessage(error)
    const status = error instanceof SkillServiceError
      ? error.code === "not_found"
        ? 404
        : error.code === "invalid_input"
          ? 400
          : error.code === "conflict"
            ? 409
            : 500
      : 500
    return {
      ok: false,
      status,
      error: message,
    }
  }
}

export function parseToggleSkillPayload(payload: unknown): ReturnType<typeof toggleSkillBodySchema.safeParse> {
  return toggleSkillBodySchema.safeParse(payload)
}

export function resolveSkillAction(input: z.infer<typeof toggleSkillBodySchema>) {
  return input.action ?? (input.enabled ? "ask" : "deny")
}

export async function updateSkill(input: {
  directory: string
  name: string
  action: ReturnType<typeof resolveSkillAction>
}): Promise<
  | {
      ok: true
      skill: Awaited<ReturnType<typeof setInstalledSkillAction>>
      action: ReturnType<typeof resolveSkillAction>
    }
  | {
      ok: false
      status: 400
      error: string
    }
> {
  try {
    const skill = await setInstalledSkillAction(input.name, input.action, input.directory)
    return {
      ok: true,
      skill,
      action: input.action,
    }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: skillErrorMessage(error),
    }
  }
}

export async function removeSkill(input: {
  directory: string
  name: string
}): Promise<
  | {
      ok: true
      name: string
    }
  | {
      ok: false
      status: 400 | 404
      error: string
    }
> {
  try {
    const name = await removeManagedSkill(input.name, input.directory)
    return {
      ok: true,
      name,
    }
  } catch (error) {
    const message = skillErrorMessage(error)
    const status = error instanceof SkillServiceError ? (error.code === "not_found" ? 404 : 400) : 400
    return {
      ok: false,
      status,
      error: message,
    }
  }
}
