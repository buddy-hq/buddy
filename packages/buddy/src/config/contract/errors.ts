import type { ZodIssue } from "zod"
import { parseConfigString } from "../parse-values.js"

export class JsonError extends Error {
  readonly data: {
    path: string
    message?: string
  }

  constructor(data: { path: string; message?: string }, options?: ErrorOptions) {
    super(
      data.message ?? `Invalid JSONC in ${data.path}`,
      options?.cause !== undefined ? options : undefined,
    )
    this.name = "ConfigJsonError"
    this.data = data
  }
}

export class InvalidError extends Error {
  readonly data: {
    path: string
    issues?: ZodIssue[]
    message?: string
  }

  constructor(
    data: { path: string; issues?: ZodIssue[]; message?: string },
    options?: ErrorOptions,
  ) {
    super(
      data.message ?? `Invalid config: ${data.path}`,
      options?.cause !== undefined ? options : undefined,
    )
    this.name = "ConfigInvalidError"
    this.data = data
  }
}

export function isConfigValidationError<TError>(error: TError): boolean {
  return error instanceof JsonError || error instanceof InvalidError
}

export function configErrorMessage<TError>(error: TError): string {
  if (error instanceof InvalidError && error.data.issues && error.data.issues.length > 0) {
    const issueText = error.data.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
        return `${path}: ${issue.message}`
      })
      .join("; ")
    return `Invalid config: ${error.data.path} (${issueText})`
  }
  if (error instanceof Error && error.message) return error.message
  return parseConfigString(error) ?? "Invalid config"
}
