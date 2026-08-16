import z from "zod"
import { parseJsonObject, parsePromptString, type TJsonObject } from "../learning/prompt/utils"

export type TProjectJsonObject = TJsonObject

export const PROJECT_NODE_ERRNO = {
  accessDenied: "EACCES",
  notFound: "ENOENT",
  permissionDenied: "EPERM",
} as const

const projectNodeErrnoSchema = z.object({
  code: z.string().optional(),
})

const projectErrorPayloadSchema = z.object({
  name: z.string().optional().catch(undefined),
  message: z.string().optional().catch(undefined),
  data: z
    .object({
      message: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  cause: z.unknown().optional(),
})

const openProjectDirectorySchema = z.object({
  directory: z.string(),
})

const monorepoPackageJsonSchema = z.object({
  workspaces: z
    .union([
      z.array(z.json()),
      z.object({
        packages: z.array(z.json()).optional(),
      }),
    ])
    .optional(),
})

export type TProjectNodeErrno = z.infer<typeof projectNodeErrnoSchema>
export type TProjectErrorPayload = z.infer<typeof projectErrorPayloadSchema>
export type TOpenProjectDirectory = z.infer<typeof openProjectDirectorySchema>
export type TMonorepoPackageJson = z.infer<typeof monorepoPackageJsonSchema>

export function parseProjectString<TValue>(value: TValue): string | undefined {
  return parsePromptString(value)
}

export function parseProjectJsonObject<TValue>(value: TValue): TProjectJsonObject | undefined {
  return parseJsonObject(value)
}

export function parseProjectNodeErrno<TValue>(value: TValue): TProjectNodeErrno | undefined {
  const parsed = projectNodeErrnoSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseProjectNodeErrnoCode<TValue>(value: TValue): string | undefined {
  return parseProjectNodeErrno(value)?.code
}

export function parseProjectErrorPayload<TValue>(value: TValue): TProjectErrorPayload | undefined {
  const parsed = projectErrorPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseOpenProjectDirectory<TValue>(value: TValue): string | undefined {
  const parsed = openProjectDirectorySchema.safeParse(value)
  return parsed.success ? parsed.data.directory : undefined
}

export function parseMonorepoPackageJson<TValue>(value: TValue): TMonorepoPackageJson | undefined {
  const parsed = monorepoPackageJsonSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function monorepoPackageJsonDeclaresWorkspaces(packageJson: TMonorepoPackageJson): boolean {
  const workspaces = packageJson.workspaces
  if (workspaces === undefined) return false
  if (Array.isArray(workspaces)) return true
  return Array.isArray(workspaces.packages)
}
