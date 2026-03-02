import type { ZodIssue } from "zod"

export class JsonError extends Error {
  readonly data: {
    path: string
    message?: string
  }

  constructor(data: { path: string; message?: string }, options?: { cause?: unknown }) {
    super(data.message ?? `Invalid JSONC in ${data.path}`)
    this.name = "ConfigJsonError"
    this.data = data
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export class InvalidError extends Error {
  readonly data: {
    path: string
    issues?: ZodIssue[]
    message?: string
  }

  constructor(data: { path: string; issues?: ZodIssue[]; message?: string }, options?: { cause?: unknown }) {
    super(data.message ?? `Invalid config: ${data.path}`)
    this.name = "ConfigInvalidError"
    this.data = data
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export function isConfigValidationError(error: unknown): boolean {
  return error instanceof JsonError || error instanceof InvalidError
}

export function configErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "Invalid config"
}
