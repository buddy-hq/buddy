import { RuntimeError } from "@buddy/agent-runtime/errors"
import type { ProjectInfo, Workspace } from "@buddy/agent-runtime/workspace"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

function projectInfo(
  project: Awaited<ReturnType<OpenCodeHost["project"]["list"]>>[number],
): ProjectInfo {
  return {
    id: project.id,
    worktree: project.canonical,
    vcs: project.vcs,
    name: project.name,
    icon: project.icon,
    commands: project.commands,
    time: {
      created: project.time.created,
      updated: project.time.updated,
      initialized: project.time.active,
    },
    sandboxes: project.sandboxes,
  }
}

export function createWorkspace(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): Workspace {
  return {
    async projects() {
      try {
        return (await host.project.list()).map(projectInfo)
      } catch (cause) {
        throw toRuntimeError(cause)
      }
    },
    async updateProject(projectID, input) {
      try {
        return projectInfo(await host.project.update({ projectID, ...input }))
      } catch (cause) {
        throw toRuntimeError(cause)
      }
    },
    async location(directory) {
      try {
        const location = await host.location.get({ location: { directory } })
        return {
          directory: location.directory,
          project: {
            id: location.project.id,
            directory: location.project.directory,
            canonical: location.project.canonical,
          },
        }
      } catch (cause) {
        throw toRuntimeError(cause)
      }
    },
    async project(directory) {
      try {
        const location = await host.location.get({ location: { directory } })
        const project = (await host.project.list()).find(
          (entry) => entry.id === location.project.id,
        )
        if (!project) return undefined
        return {
          id: project.id,
          worktree: location.project.canonical,
          vcs: project.vcs,
          name: project.name,
          icon: project.icon,
          commands: project.commands,
          time: {
            created: project.time.created,
            updated: project.time.updated,
            initialized: project.time.active,
          },
          sandboxes: project.sandboxes,
        }
      } catch (cause) {
        const error = toRuntimeError(cause, String(cause))
        throw error.kind === "internal"
          ? error
          : new RuntimeError("internal", error.message, { cause: error })
      }
    },
    async findFiles(directory, search) {
      try {
        const result = await host.file.find({
          location: { directory },
          query: search.query,
          type: search.kind,
          limit: search.limit,
        })
        return result.data.map((entry) => entry.path)
      } catch (cause) {
        const error = toRuntimeError(cause, String(cause))
        throw error.kind === "internal"
          ? error
          : new RuntimeError("internal", error.message, { cause: error })
      }
    },
  }
}
