import { ensureActivityToolsRegistered } from "../../../learning/activities/tools/register.js"
import { ensureCurriculumToolsRegistered } from "../../../learning/curriculum/tools/register.js"
import { ensureFigureToolsRegistered } from "../../../learning/figures/tools/register.js"
import { ensureFreeformFigureToolsRegistered } from "../../../learning/freeform-figures/tools/register.js"
import { ensureGoalToolsRegistered } from "../../../learning/goals/tools/register.js"
import { ensureLearnerToolsRegistered } from "../../../learning/learner/tools/register.js"
import { ensureTeachingToolsRegistered } from "../../../learning/teaching/tools/register.js"
import type {
  ProxyRegistrationFlags,
  ProxyRegistrationOption,
  ProxyToOpenCodeInput,
} from "./types.js"

function warnToolRegistrationFailure(message: string, error: unknown): void {
  console.warn(message, error)
}

function registerTool(input: {
  enabled: boolean
  task: () => Promise<void>
  warning: string
  registrations: Promise<void>[]
}): void {
  if (!input.enabled) return
  input.registrations.push(
    input.task().catch((error) => {
      warnToolRegistrationFailure(input.warning, error)
    }),
  )
}

async function registerOpenCodeTools(
  directory: string,
  flags: ProxyRegistrationFlags,
): Promise<void> {
  const registrations: Promise<void>[] = []

  registerTool({
    enabled: flags.registerCurriculumTools,
    task: () => ensureCurriculumToolsRegistered(directory),
    warning: "Failed to register Buddy curriculum tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerGoalTools,
    task: () => ensureGoalToolsRegistered(directory),
    warning: "Failed to register Buddy goal tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerLearnerTools,
    task: () => ensureLearnerToolsRegistered(directory),
    warning: "Failed to register Buddy learner tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerLearnerTools,
    task: () => ensureActivityToolsRegistered(directory),
    warning: "Failed to register Buddy activity tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerTeachingTools,
    task: () => ensureTeachingToolsRegistered(directory),
    warning: "Failed to register Buddy teaching tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerFigureTools,
    task: () => ensureFigureToolsRegistered(directory),
    warning: "Failed to register Buddy figure tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerFreeformFigureTools,
    task: () => ensureFreeformFigureToolsRegistered(directory),
    warning: "Failed to register Buddy freeform figure tools into OpenCode runtime:",
    registrations,
  })

  if (registrations.length === 0) return
  await Promise.all(registrations)
}

function resolveRegistration(
  body: Record<string, unknown>,
  value: ProxyRegistrationOption | undefined,
): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "function") return value(body)
  return false
}

function resolveInitialRegistrationFlags(input: ProxyToOpenCodeInput): ProxyRegistrationFlags {
  return {
    registerCurriculumTools: typeof input.registerCurriculumTools === "boolean" ? input.registerCurriculumTools : false,
    registerFigureTools: typeof input.registerFigureTools === "boolean" ? input.registerFigureTools : false,
    registerFreeformFigureTools:
      typeof input.registerFreeformFigureTools === "boolean" ? input.registerFreeformFigureTools : false,
    registerGoalTools: typeof input.registerGoalTools === "boolean" ? input.registerGoalTools : false,
    registerLearnerTools: typeof input.registerLearnerTools === "boolean" ? input.registerLearnerTools : false,
    registerTeachingTools: typeof input.registerTeachingTools === "boolean" ? input.registerTeachingTools : false,
  }
}

function resolveBodyRegistrationFlags(
  body: Record<string, unknown>,
  input: ProxyToOpenCodeInput,
): ProxyRegistrationFlags {
  return {
    registerCurriculumTools: resolveRegistration(body, input.registerCurriculumTools),
    registerFigureTools: resolveRegistration(body, input.registerFigureTools),
    registerFreeformFigureTools: resolveRegistration(body, input.registerFreeformFigureTools),
    registerGoalTools: resolveRegistration(body, input.registerGoalTools),
    registerLearnerTools: resolveRegistration(body, input.registerLearnerTools),
    registerTeachingTools: resolveRegistration(body, input.registerTeachingTools),
  }
}

export {
  registerOpenCodeTools,
  resolveBodyRegistrationFlags,
  resolveInitialRegistrationFlags,
}
