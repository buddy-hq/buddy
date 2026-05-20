export type ProxyRegistrationPredicate = (body: Record<string, unknown>) => boolean

export type ProxyRegistrationOption = boolean | ProxyRegistrationPredicate

export type ProxyRegistrationFlags = Record<string, boolean>
export type ProxyRegistrationInput = Partial<Record<string, ProxyRegistrationOption>>
export type ProxyDirectoryMode = "required" | "optional" | "bootstrap" | "none"

export type ProxyToOpenCodeInput = {
  targetPath: string
  transformJsonBody?: (
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  forceBusyAs409?: boolean
  toolRegistrations?: ProxyRegistrationInput
  directoryMode?: ProxyDirectoryMode
}

export type FetchOpenCodeInput = {
  directory?: string
  method: string
  path: string
  query?: string
  headers?: Headers
  body?: BodyInit
  toolRegistrations?: Partial<Record<string, boolean>>
}
