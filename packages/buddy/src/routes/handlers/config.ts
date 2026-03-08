import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ZodError } from "zod"
import {
  configErrorMessage,
  isConfigValidationError,
  readProjectConfig,
  syncOpenCodeProjectConfig,
} from "../../config/compatibility.js"
import { Config } from "../../config/config.js"
import { personaCatalogEntries } from "../../personas/catalog.js"

export function mapOpenCodeAgents(
  agents: Array<{ name: string; description?: string; mode: string; hidden?: boolean }>,
) {
  return agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
  }))
}

export function configRouteValidationResponse(error: unknown): Response | undefined {
  if (error instanceof ZodError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export function parseConfigInfo(body: unknown) {
  return Config.Info.parse(body)
}

export function parseConfigMcp(body: unknown) {
  return Config.Mcp.parse(body)
}

export function mapConfigRouteError(error: unknown): Response | undefined {
  if (isConfigValidationError(error)) {
    return Response.json({ error: configErrorMessage(error) }, { status: 400 })
  }

  return configRouteValidationResponse(error)
}

export async function listProjectPersonas(directory: string) {
  const config = await readProjectConfig(directory)
  return personaCatalogEntries(config.personas)
}

export async function listProjectAgents(directory: string) {
  await syncOpenCodeProjectConfig(directory).catch((error) => {
    throw new Error(
      `Failed to sync config before listing agents: ${String(error instanceof Error ? error.message : error)}`,
    )
  })
  const agents = await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeAgent.list(),
  })

  return mapOpenCodeAgents(agents)
}

export async function patchProjectConfig(input: {
  directory: string
  payload: unknown
}) {
  const parsed = parseConfigInfo(input.payload)
  await Config.updateProject(input.directory, parsed)
  await syncOpenCodeProjectConfig(input.directory)
  return readProjectConfig(input.directory)
}

export async function putProjectMcpConfig(input: {
  directory: string
  name: string
  payload: unknown
}) {
  const parsed = parseConfigMcp(input.payload)
  await Config.setProjectMcp(input.directory, input.name, parsed)
  await syncOpenCodeProjectConfig(input.directory)
  return readProjectConfig(input.directory)
}
