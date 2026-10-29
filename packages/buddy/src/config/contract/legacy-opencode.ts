import z from "zod"

const Action = z.enum(["allow", "ask", "deny"])
const Rule = z.union([Action, z.record(z.string(), Action)])
export const Permission = z.union([Action, z.record(z.string(), Rule)]).transform((value) =>
  Action.safeParse(value).success ? { "*": Action.parse(value) } : z.record(z.string(), Rule).parse(value),
)
export type PermissionAction = z.output<typeof Action>
export type PermissionRule = z.output<typeof Rule>

const Options = z.record(z.string(), z.json())
const PositiveInt = z.number().int().positive()
export const ModelID = z.string()
export const Skills = z.object({ paths: z.array(z.string()).optional(), urls: z.array(z.string()).optional() }).strict()
const AgentFields = z.object({
  name: z.string().optional(), model: ModelID.optional(), variant: z.string().optional(),
  temperature: z.number().optional(), top_p: z.number().optional(), prompt: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(), disable: z.boolean().optional(),
  description: z.string().optional(), mode: z.enum(["subagent", "primary", "all"]).optional(),
  hidden: z.boolean().optional(), options: Options.optional(),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.enum(["primary", "secondary", "accent", "success", "warning", "error", "info"])]).optional(),
  steps: PositiveInt.optional(), maxSteps: PositiveInt.optional(), permission: Permission.optional(),
}).strict()
const agentKeys = new Set<string>(AgentFields.keyof().options)
export const Agent = AgentFields.loose().transform((input) => {
  const agent = AgentFields.parse(Object.fromEntries(Object.entries(input).filter(([key]) => agentKeys.has(key))))
  const { tools, options, steps, maxSteps, permission } = agent
  const extra = Options.parse(Object.fromEntries(Object.entries(input).filter(([key]) => !(agentKeys.has(key)))))
  const toolRules = Object.fromEntries(Object.entries(tools ?? {}).map(([tool, enabled]) =>
    [tool === "write" || tool === "patch" ? "edit" : tool, enabled ? "allow" as const : "deny" as const],
  ))
  const result = { ...agent, options: { ...options, ...extra }, permission: { ...toolRules, ...permission } }
  if (steps !== undefined || maxSteps !== undefined) result.steps = steps ?? maxSteps
  return result
})

const OAuth = z.object({
  clientId: z.string().optional(), clientSecret: z.string().optional(), scope: z.string().optional(),
  callbackPort: z.number().int().min(1).max(65535).optional(), redirectUri: z.string().optional(),
}).strict()
export const Mcp = z.discriminatedUnion("type", [
  z.object({ type: z.literal("local"), command: z.array(z.string()), cwd: z.string().optional(),
    environment: z.record(z.string(), z.string()).optional(), enabled: z.boolean().optional(), timeout: PositiveInt.optional() }).strict(),
  z.object({ type: z.literal("remote"), url: z.string(), enabled: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(), oauth: z.union([OAuth, z.literal(false)]).optional(), timeout: PositiveInt.optional() }).strict(),
])
const Cost = z.object({ input: z.number(), output: z.number(), cache_read: z.number().optional(), cache_write: z.number().optional() }).strict()
const Modalities = z.array(z.enum(["text", "audio", "image", "video", "pdf"]))
const Model = z.object({
  id: z.string().optional(), name: z.string().optional(), family: z.string().optional(), release_date: z.string().optional(),
  attachment: z.boolean().optional(), reasoning: z.boolean().optional(), temperature: z.boolean().optional(), tool_call: z.boolean().optional(),
  interleaved: z.union([z.boolean(), z.string(), z.object({ field: z.string() }).strict()]).optional(),
  cost: Cost.extend({ context_over_200k: Cost.optional() }).optional(),
  limit: z.object({ context: z.number(), input: z.number().optional(), output: z.number() }).strict().optional(),
  modalities: z.object({ input: Modalities.optional(), output: Modalities.optional() }).strict().optional(),
  experimental: z.boolean().optional(), status: z.enum(["alpha", "beta", "deprecated", "active"]).optional(),
  provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).strict().optional(),
  options: Options.optional(), headers: z.record(z.string(), z.string()).optional(),
  variants: z.record(z.string(), z.object({ disabled: z.boolean().optional() }).catchall(z.json())).optional(),
}).strict()
export const Provider = z.object({
  api: z.string().optional(), name: z.string().optional(), env: z.array(z.string()).optional(),
  id: z.string().optional(), npm: z.string().optional(), whitelist: z.array(z.string()).optional(), blacklist: z.array(z.string()).optional(),
  options: z.object({ apiKey: z.string().optional(), baseURL: z.string().optional(), enterpriseUrl: z.string().optional(),
    setCacheKey: z.boolean().optional(), timeout: z.union([PositiveInt, z.literal(false)]).optional(),
    headerTimeout: z.union([PositiveInt, z.literal(false)]).optional(), chunkTimeout: PositiveInt.optional() }).catchall(z.json()).optional(),
  models: z.record(z.string(), Model).optional(),
}).strict()
