export const AnyObjectSchema = {
  type: "object",
  additionalProperties: true,
}

export const LearnerSessionPlanSchema = {
  type: "object",
  properties: {
    warmupReviewGoalIds: { type: "array", items: { type: "string" } },
    primaryGoalId: { type: "string" },
    suggestedActivity: { type: "string" },
    suggestedScaffoldingLevel: { type: "string" },
    alternatives: { type: "array", items: { type: "string" } },
    rationale: { type: "array", items: { type: "string" } },
    motivationHook: { type: "string" },
    constraintsConsidered: { type: "array", items: { type: "string" } },
    prerequisiteWarnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "warmupReviewGoalIds",
    "suggestedActivity",
    "suggestedScaffoldingLevel",
    "alternatives",
    "rationale",
    "constraintsConsidered",
    "prerequisiteWarnings",
  ],
  additionalProperties: true,
}

export const LearnerSnapshotSchema = {
  type: "object",
  properties: {
    workspace: AnyObjectSchema,
    profile: AnyObjectSchema,
    goals: { type: "array", items: AnyObjectSchema },
    activeMisconceptions: { type: "array", items: AnyObjectSchema },
    openFeedback: { type: "array", items: AnyObjectSchema },
    recentEvidence: { type: "array", items: AnyObjectSchema },
    latestPlan: AnyObjectSchema,
    constraintsSummary: { type: "array", items: { type: "string" } },
    activityBundles: { type: "array", items: AnyObjectSchema },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["title", "items"],
        additionalProperties: false,
      },
    },
    markdown: { type: "string" },
    decisionInputFingerprint: { type: "string" },
  },
  required: [
    "workspace",
    "profile",
    "goals",
    "activeMisconceptions",
    "openFeedback",
    "recentEvidence",
    "constraintsSummary",
    "activityBundles",
    "sections",
    "markdown",
    "decisionInputFingerprint",
  ],
  additionalProperties: true,
}

export const PlanRequestSchema = {
  type: "object",
  properties: {
    persona: { type: "string", enum: ["buddy", "code-buddy", "math-buddy"] },
    intent: { type: "string", enum: ["learn", "practice", "assess", "auto"] },
    goalIds: { type: "array", items: { type: "string" } },
    sessionId: { type: "string" },
    workspaceState: { type: "string", enum: ["chat", "interactive"] },
    generateDecision: { type: "boolean" },
  },
  additionalProperties: false,
}

export const PlanResponseSchema = {
  type: "object",
  properties: {
    snapshot: LearnerSnapshotSchema,
    plan: LearnerSessionPlanSchema,
    decision: AnyObjectSchema,
  },
  required: ["snapshot", "plan"],
  additionalProperties: true,
}

export const LearnerPlanResponseSchema = PlanResponseSchema

export const ArtifactsRequestSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [
        "goal",
        "message",
        "practice",
        "assessment",
        "evidence",
        "feedback",
        "misconception",
        "decision-interpret-message",
        "decision-feedback",
        "decision-plan",
      ],
    },
    goalId: { type: "string" },
    status: { type: "string" },
    includeRaw: { type: "boolean" },
  },
  additionalProperties: false,
}

export const ArtifactsResponseSchema = {
  type: "object",
  properties: {
    artifacts: {
      type: "array",
      items: AnyObjectSchema,
    },
  },
  required: ["artifacts"],
  additionalProperties: false,
}

const WorkspacePatchWorkspaceSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    pinnedGoalIds: { type: "array", items: { type: "string" } },
    projectConstraints: { type: "array", items: { type: "string" } },
    localToolAvailability: { type: "array", items: { type: "string" } },
    preferredSurfaces: { type: "array", items: { type: "string", enum: ["chat", "curriculum", "editor", "figure", "quiz"] } },
    motivationContext: { type: "string" },
    opportunities: { type: "array", items: { type: "string" } },
    userOverride: { type: "boolean" },
  },
  additionalProperties: false,
}

const WorkspacePatchProfileSchema = {
  type: "object",
  properties: {
    background: { type: "array", items: { type: "string" } },
    knownPrerequisites: { type: "array", items: { type: "string" } },
    availableTimePatterns: { type: "array", items: { type: "string" } },
    toolEnvironmentLimits: { type: "array", items: { type: "string" } },
    motivationAnchors: { type: "array", items: { type: "string" } },
    learnerPreferences: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
}

export const WorkspaceRequestSchema = {
  type: "object",
  properties: {
    workspace: WorkspacePatchWorkspaceSchema,
    profile: WorkspacePatchProfileSchema,
  },
  additionalProperties: false,
}

const WorkspaceContextResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["workspace-context"] },
    workspaceId: { type: "string" },
    goalIds: { type: "array", items: { type: "string" } },
    label: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    pinnedGoalIds: { type: "array", items: { type: "string" } },
    projectConstraints: { type: "array", items: { type: "string" } },
    localToolAvailability: { type: "array", items: { type: "string" } },
    preferredSurfaces: { type: "array", items: { type: "string", enum: ["chat", "curriculum", "editor", "figure", "quiz"] } },
    motivationContext: { type: "string" },
    opportunities: { type: "array", items: { type: "string" } },
    userOverride: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "id",
    "kind",
    "workspaceId",
    "goalIds",
    "label",
    "tags",
    "pinnedGoalIds",
    "projectConstraints",
    "localToolAvailability",
    "preferredSurfaces",
    "opportunities",
    "userOverride",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: true,
}

const ProfileResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["profile"] },
    workspaceId: { type: "string" },
    goalIds: { type: "array", items: { type: "string" } },
    background: { type: "array", items: { type: "string" } },
    knownPrerequisites: { type: "array", items: { type: "string" } },
    availableTimePatterns: { type: "array", items: { type: "string" } },
    toolEnvironmentLimits: { type: "array", items: { type: "string" } },
    motivationAnchors: { type: "array", items: { type: "string" } },
    learnerPreferences: { type: "array", items: { type: "string" } },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "id",
    "kind",
    "goalIds",
    "background",
    "knownPrerequisites",
    "availableTimePatterns",
    "toolEnvironmentLimits",
    "motivationAnchors",
    "learnerPreferences",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: true,
}

export const WorkspaceResponseSchema = {
  type: "object",
  properties: {
    workspace: WorkspaceContextResponseSchema,
    profile: ProfileResponseSchema,
  },
  required: ["workspace", "profile"],
  additionalProperties: false,
}

export const ErrorSchema = {
  type: "object",
  properties: {
    error: {
      type: "string",
    },
  },
  required: ["error"],
  additionalProperties: true,
}

export const SessionInfoSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    parentID: { type: "string" },
    time: {
      type: "object",
      properties: {
        created: { type: "number" },
        updated: { type: "number" },
        archived: { type: "number" },
      },
      required: ["created", "updated"],
      additionalProperties: true,
    },
  },
  required: ["id", "title", "time"],
  additionalProperties: true,
}

export const MessageWithPartsSchema = {
  type: "object",
  properties: {
    info: AnyObjectSchema,
    parts: {
      type: "array",
      items: AnyObjectSchema,
    },
  },
  required: ["info", "parts"],
  additionalProperties: true,
}

export const PermissionRequestSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sessionID: { type: "string" },
    permission: { type: "string" },
    patterns: {
      type: "array",
      items: { type: "string" },
    },
    metadata: AnyObjectSchema,
    always: {
      type: "array",
      items: { type: "string" },
    },
    tool: AnyObjectSchema,
  },
  required: ["id", "sessionID", "permission", "patterns", "metadata", "always"],
  additionalProperties: true,
}

export const BooleanSchema = { type: "boolean" }

export const ProjectInfoSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    worktree: { type: "string" },
    vcs: { type: "string", enum: ["git"] },
    name: { type: "string" },
    icon: {
      type: "object",
      properties: {
        url: { type: "string" },
        override: { type: "string" },
        color: { type: "string" },
      },
      additionalProperties: false,
    },
    commands: {
      type: "object",
      properties: {
        start: { type: "string" },
      },
      additionalProperties: false,
    },
    time: {
      type: "object",
      properties: {
        created: { type: "number" },
        updated: { type: "number" },
        initialized: { type: "number" },
      },
      required: ["created", "updated"],
      additionalProperties: false,
    },
    sandboxes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["id", "worktree", "time", "sandboxes"],
  additionalProperties: false,
}

export const ProjectUpdateSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    icon: {
      type: "object",
      properties: {
        url: { type: "string" },
        override: { type: "string" },
        color: { type: "string" },
      },
      additionalProperties: false,
    },
    commands: {
      type: "object",
      properties: {
        start: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

export const DirectoryHeader = {
  name: "x-buddy-directory",
  in: "header",
  required: false,
  schema: { type: "string" },
}

export const DirectoryQuery = {
  name: "directory",
  in: "query",
  required: false,
  schema: { type: "string" },
}

export const SessionIDPath = {
  name: "sessionID",
  in: "path",
  required: true,
  schema: { type: "string" },
}

export const RequestIDPath = {
  name: "requestID",
  in: "path",
  required: true,
  schema: { type: "string" },
}

export const ProviderIDPath = {
  name: "providerID",
  in: "path",
  required: true,
  schema: { type: "string" },
}

export const ProjectIDPath = {
  name: "projectID",
  in: "path",
  required: true,
  schema: { type: "string" },
}

export const McpNamePath = {
  name: "name",
  in: "path",
  required: true,
  schema: { type: "string" },
}
