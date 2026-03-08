import z from "zod"
import {
  configErrorMessage,
  isConfigValidationError,
  readProjectConfig,
} from "../../config/compatibility.js"
import {
  TeachingService,
  TeachingWorkspaceFileError,
  TeachingRevisionConflictError,
  TeachingWorkspaceNotFoundError,
} from "../../learning/teaching/service.js"
import {
  TeachingLanguageSchema,
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../../learning/teaching/types.js"
import { getBuddyPersona, getDefaultBuddyPersona } from "../../personas/catalog.js"
import { isPersonaId } from "../../personas/types.js"

export const TeachingProvisionRequestSchema = z.object({
  language: TeachingLanguageSchema.optional(),
  persona: z.string().optional(),
})

export function resolveTeachingProvisionPersona(input: {
  config: Awaited<ReturnType<typeof readProjectConfig>>
  requestedPersona?: string
}) {
  if (input.requestedPersona) {
    if (!isPersonaId(input.requestedPersona)) {
      return undefined
    }

    const explicitPersona = getBuddyPersona(input.requestedPersona, input.config.personas)
    if (explicitPersona.hidden) {
      return undefined
    }

    return explicitPersona
  }

  return getDefaultBuddyPersona({
    defaultPersona: input.config.default_persona,
    overrides: input.config.personas,
  })
}

export function mapTeachingWorkspaceError(error: unknown): Response | undefined {
  if (error instanceof TeachingWorkspaceNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }

  if (error instanceof TeachingWorkspaceFileError) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  if (error instanceof TeachingRevisionConflictError) {
    return Response.json(
      {
        error: error.message,
        ...error.response,
      },
      { status: 409 },
    )
  }

  return undefined
}

type TeachingHandlerResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      response: Response
    }

async function runTeachingWorkspaceAction<T>(
  action: () => Promise<T>,
): Promise<TeachingHandlerResult<T>> {
  try {
    return {
      ok: true,
      value: await action(),
    }
  } catch (error) {
    const mapped = mapTeachingWorkspaceError(error)
    if (mapped) {
      return {
        ok: false,
        response: mapped,
      }
    }
    throw error
  }
}

export async function provisionTeachingWorkspace(input: {
  directory: string
  sessionID: string
  payload: z.infer<typeof TeachingProvisionRequestSchema>
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.ensure>>>> {
  let config: Awaited<ReturnType<typeof readProjectConfig>>
  try {
    config = await readProjectConfig(input.directory)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return {
        ok: false,
        response: Response.json({ error: configErrorMessage(error) }, { status: 400 }),
      }
    }
    throw error
  }

  const persona = resolveTeachingProvisionPersona({
    config,
    requestedPersona: input.payload.persona,
  })
  if (!persona) {
    return {
      ok: false,
      response: Response.json({ error: "Unknown Buddy persona" }, { status: 400 }),
    }
  }

  if (!persona.surfaces.includes("editor")) {
    return {
      ok: false,
      response: Response.json(
        {
          error: `Buddy persona "${persona.id}" cannot start an interactive lesson`,
        },
        { status: 400 },
      ),
    }
  }

  const workspace = await TeachingService.ensure(input.directory, input.sessionID, input.payload.language ?? "ts")
  return {
    ok: true,
    value: workspace,
  }
}

export async function readTeachingWorkspace(input: {
  directory: string
  sessionID: string
  optional: boolean
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.read>>>> {
  try {
    const workspace = await TeachingService.read(input.directory, input.sessionID)
    return {
      ok: true,
      value: workspace,
    }
  } catch (error) {
    if (error instanceof TeachingWorkspaceNotFoundError) {
      if (input.optional) {
        return {
          ok: false,
          response: new Response(null, { status: 204 }),
        }
      }
      return {
        ok: false,
        response: Response.json({ error: error.message }, { status: 404 }),
      }
    }
    throw error
  }
}

export async function saveTeachingWorkspace(input: {
  directory: string
  sessionID: string
  payload: z.infer<typeof TeachingWorkspaceUpdateRequestSchema>
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.save>>>> {
  return runTeachingWorkspaceAction(() => TeachingService.save(input.directory, input.sessionID, input.payload))
}

export async function addTeachingWorkspaceFile(input: {
  directory: string
  sessionID: string
  payload: z.infer<typeof TeachingWorkspaceCreateFileRequestSchema>
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.addFile>>>> {
  return runTeachingWorkspaceAction(() => TeachingService.addFile(input.directory, input.sessionID, input.payload))
}

export async function activateTeachingWorkspaceFile(input: {
  directory: string
  sessionID: string
  payload: z.infer<typeof TeachingWorkspaceActivateFileRequestSchema>
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.activateFile>>>> {
  return runTeachingWorkspaceAction(() =>
    TeachingService.activateFile(input.directory, input.sessionID, input.payload.relativePath),
  )
}

export async function checkpointTeachingWorkspace(input: {
  directory: string
  sessionID: string
}): Promise<
  TeachingHandlerResult<{
    revision: Awaited<ReturnType<typeof TeachingService.checkpoint>>["revision"]
    lessonFilePath: string
    checkpointFilePath: string
  }>
> {
  try {
    const checkpoint = await TeachingService.checkpoint(input.directory, input.sessionID)
    return {
      ok: true,
      value: {
        revision: checkpoint.revision,
        lessonFilePath: checkpoint.lessonFilePath,
        checkpointFilePath: checkpoint.checkpointFilePath,
      },
    }
  } catch (error) {
    if (error instanceof TeachingWorkspaceNotFoundError) {
      return {
        ok: false,
        response: Response.json({ error: error.message }, { status: 404 }),
      }
    }
    throw error
  }
}

export async function restoreTeachingWorkspace(input: {
  directory: string
  sessionID: string
}): Promise<TeachingHandlerResult<Awaited<ReturnType<typeof TeachingService.restore>>>> {
  try {
    const workspace = await TeachingService.restore(input.directory, input.sessionID)
    return {
      ok: true,
      value: workspace,
    }
  } catch (error) {
    if (error instanceof TeachingWorkspaceNotFoundError) {
      return {
        ok: false,
        response: Response.json({ error: error.message }, { status: 404 }),
      }
    }
    throw error
  }
}
