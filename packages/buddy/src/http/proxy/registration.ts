import { registerRuntimeTools } from "../../learning/tools/register-runtime-tools"
import type { ProxyRegistrationFlags, ProxyRegistrationOption, ProxyToOpenCodeInput } from "./types"

async function registerOpenCodeTools(
  directory: string,
  flags: ProxyRegistrationFlags,
): Promise<void> {
  await registerRuntimeTools(directory, flags)
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
    registerPedagogyTools:
      typeof input.registerPedagogyTools === "boolean" ? input.registerPedagogyTools : false,
    registerCurriculumTools:
      typeof input.registerCurriculumTools === "boolean" ? input.registerCurriculumTools : false,
    registerKnowledgeGraphTools:
      typeof input.registerKnowledgeGraphTools === "boolean"
        ? input.registerKnowledgeGraphTools
        : false,
    registerFigureTools:
      typeof input.registerFigureTools === "boolean" ? input.registerFigureTools : false,
    registerFreeformFigureTools:
      typeof input.registerFreeformFigureTools === "boolean"
        ? input.registerFreeformFigureTools
        : false,
    registerMermaidTools:
      typeof input.registerMermaidTools === "boolean" ? input.registerMermaidTools : false,
    registerGoalTools:
      typeof input.registerGoalTools === "boolean" ? input.registerGoalTools : false,
    registerLearnerTools:
      typeof input.registerLearnerTools === "boolean" ? input.registerLearnerTools : false,
    registerTeachingTools:
      typeof input.registerTeachingTools === "boolean" ? input.registerTeachingTools : false,
    registerMathTools:
      typeof input.registerMathTools === "boolean" ? input.registerMathTools : false,
    registerQuestionSetTools:
      typeof input.registerQuestionSetTools === "boolean" ? input.registerQuestionSetTools : false,
  }
}

function resolveBodyRegistrationFlags(
  body: Record<string, unknown>,
  input: ProxyToOpenCodeInput,
): ProxyRegistrationFlags {
  return {
    registerPedagogyTools: resolveRegistration(body, input.registerPedagogyTools),
    registerCurriculumTools: resolveRegistration(body, input.registerCurriculumTools),
    registerKnowledgeGraphTools: resolveRegistration(body, input.registerKnowledgeGraphTools),
    registerFigureTools: resolveRegistration(body, input.registerFigureTools),
    registerFreeformFigureTools: resolveRegistration(body, input.registerFreeformFigureTools),
    registerMermaidTools: resolveRegistration(body, input.registerMermaidTools),
    registerGoalTools: resolveRegistration(body, input.registerGoalTools),
    registerLearnerTools: resolveRegistration(body, input.registerLearnerTools),
    registerTeachingTools: resolveRegistration(body, input.registerTeachingTools),
    registerMathTools: resolveRegistration(body, input.registerMathTools),
    registerQuestionSetTools: resolveRegistration(body, input.registerQuestionSetTools),
  }
}

export { registerOpenCodeTools, resolveBodyRegistrationFlags, resolveInitialRegistrationFlags }
