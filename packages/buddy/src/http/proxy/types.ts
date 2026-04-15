import type { LearningToolGroup } from "../../learning/tools/tool-metadata"

export type ProxyRegistrationPredicate = (body: Record<string, unknown>) => boolean

export type ProxyRegistrationOption = boolean | ProxyRegistrationPredicate

export type ProxyRegistrationFlags = Record<LearningToolGroup, boolean>
export type ProxyRegistrationInput = Partial<Record<LearningToolGroup, ProxyRegistrationOption>>

export type ProxyToOpenCodeInput = {
  targetPath: string
  transformJsonBody?: (
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  forceBusyAs409?: boolean
  toolRegistrations?: ProxyRegistrationInput
}

export type FetchOpenCodeInput = {
  directory: string
  method: string
  path: string
  query?: string
  headers?: Headers
  body?: BodyInit
  toolRegistrations?: Partial<Record<LearningToolGroup, boolean>>
}
