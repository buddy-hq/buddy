import type { Approvals } from "./approvals"
import type { Catalog } from "./catalog"
import type { ChatGPT } from "./chatgpt"
import type { Conversations } from "./conversations"
import type { Events } from "./events"
import type { Execution } from "./execution"
import type { Forms } from "./forms"
import type { Mcp } from "./mcp"
import type { Providers } from "./providers"
import type { References } from "./references"
import type { Workspace } from "./workspace"

export interface AgentRuntime {
  readonly name: string
  readonly version: string
  readonly conversations: Conversations
  readonly execution: Execution
  readonly events: Events
  readonly approvals: Approvals
  readonly forms: Forms
  readonly catalog: Catalog
  readonly workspace: Workspace
  readonly providers: Providers
  readonly mcp: Mcp
  readonly references: References
  readonly chatgpt: ChatGPT
}
