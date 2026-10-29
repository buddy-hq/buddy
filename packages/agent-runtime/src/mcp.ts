export type McpStatus =
  | { readonly status: "connected" }
  | { readonly status: "pending" }
  | { readonly status: "disabled" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "needs_auth"; readonly error: string }
  | { readonly status: "needs_client_registration"; readonly error: string }

export type McpServer = {
  readonly name: string
  readonly status: McpStatus
  readonly integrationID?: string
}

export type McpAuthAttempt = {
  readonly server: string
  readonly integrationID: string
  readonly attemptID: string
  readonly url: string
  readonly expires: number
}

export type McpAuthProgress =
  | { readonly state: "pending" }
  | { readonly state: "complete" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "expired" }

export interface Mcp {
  servers(directory: string): Promise<McpServer[]>
  connect(directory: string, server: string): Promise<void>
  disconnect(directory: string, server: string): Promise<void>
  startAuth(directory: string, server: string): Promise<McpAuthAttempt>
  authProgress(directory: string, attempt: McpAuthAttempt): Promise<McpAuthProgress>
  cancelAuth(directory: string, attempt: McpAuthAttempt): Promise<void>
  removeCredentials(directory: string, server: string): Promise<void>
}
