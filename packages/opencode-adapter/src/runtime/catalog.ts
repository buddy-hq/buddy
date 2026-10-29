import type { Catalog } from "@buddy/agent-runtime/catalog"
import { RuntimeError } from "@buddy/agent-runtime/errors"
import { toBuddyPermissionRules } from "@buddy/transcript-contract/permission-rules"
import {
  activeNotebookDirectories,
  isSuppressedOpenCodeSkill,
  NOTEBOOK_CONFIG_RPC,
  publishNotebookPlan,
  syncActiveNotebookLocations,
} from "../extension/notebook"
import { listExecutableCommands } from "../gateway/command"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

function catalogError<TCause>(cause: TCause): RuntimeError {
  const error = toRuntimeError(cause)
  return error.kind === "internal"
    ? error
    : new RuntimeError("internal", error.message, { subject: error.subject, cause })
}

export function createCatalog(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): Catalog {
  return {
    async publishNotebookPlan(directory, plan) {
      try {
        return publishNotebookPlan(directory, plan)
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async activeNotebookDirectories() {
      try {
        return activeNotebookDirectories()
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async syncActiveNotebookLocations(directory, revision, { force } = {}) {
      try {
        await syncActiveNotebookLocations(directory, revision, { force })
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async syncNotebookLocation(directory, revision, options) {
      try {
        await host.rpc.call({
          rpcID: NOTEBOOK_CONFIG_RPC.id,
          method: "sync",
          input: { revision, force: options?.force ?? false },
          location: { directory },
        })
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async awaitNotebookPlan(directory) {
      try {
        await host.rpc.call({
          rpcID: NOTEBOOK_CONFIG_RPC.id,
          method: "ready",
          input: {},
          location: { directory },
        })
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async agentRules(directory, agentID) {
      try {
        const { data } = await host.agent.get({ location: { directory }, agentID })
        return toBuddyPermissionRules(data.permissions)
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async agents(directory) {
      try {
        const { data } = await host.agent.list({ location: { directory } })
        return data.map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          mode: agent.mode,
          hidden: agent.hidden,
          model: agent.model && {
            providerID: agent.model.providerID,
            modelID: agent.model.id,
            variant: agent.model.variant,
          },
        }))
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async skills(directory) {
      try {
        const { data } = await host.skill.list({ location: { directory } })
        return data
          .filter((skill) => !isSuppressedOpenCodeSkill(skill))
          .map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description ?? "",
            path: skill.path,
            content: skill.content,
          }))
      } catch (cause) {
        throw catalogError(cause)
      }
    },
    async commands(directory) {
      try {
        return await listExecutableCommands(host, directory)
      } catch (cause) {
        throw catalogError(cause)
      }
    },
  }
}
