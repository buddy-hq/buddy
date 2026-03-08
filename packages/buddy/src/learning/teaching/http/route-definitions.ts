import {
  TeachingProvisionRequestSchema,
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../types.js"

const teachingRoutes = {
  provisionWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/workspace",
    bodySchema: TeachingProvisionRequestSchema,
    bodyOptional: true,
    bodyFallback: {},
  },
  readWorkspace: {
    method: "get" as const,
    path: "/session/:sessionID/workspace",
  },
  saveWorkspace: {
    method: "put" as const,
    path: "/session/:sessionID/workspace",
    bodySchema: TeachingWorkspaceUpdateRequestSchema,
  },
  addFile: {
    method: "post" as const,
    path: "/session/:sessionID/file",
    bodySchema: TeachingWorkspaceCreateFileRequestSchema,
  },
  activateFile: {
    method: "post" as const,
    path: "/session/:sessionID/active-file",
    bodySchema: TeachingWorkspaceActivateFileRequestSchema,
  },
  checkpointWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/checkpoint",
  },
  restoreWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/restore",
  },
}

export { teachingRoutes }
