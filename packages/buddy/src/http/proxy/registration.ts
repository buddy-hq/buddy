import { registerLearningRuntimeTools } from "../../learning/runtime/tool-registration.js"
import type {
  ProxyRegistrationFlags,
  ProxyRegistrationOption,
  ProxyToOpenCodeInput,
} from "./types.js"

async function registerOpenCodeTools(
  directory: string,
  flags: ProxyRegistrationFlags,
): Promise<void> {
  await registerLearningRuntimeTools(directory, flags)
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
