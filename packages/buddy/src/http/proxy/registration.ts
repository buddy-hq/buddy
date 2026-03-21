import { registerRuntimeTools } from '../../learning/tools/register-runtime-tools'
import type { ProxyRegistrationFlags, ProxyRegistrationOption, ProxyToOpenCodeInput } from './types'

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
  if (typeof value === 'boolean') return value
  if (typeof value === 'function') return value(body)
  return false
}

function resolveInitialRegistrationFlags(input: ProxyToOpenCodeInput): ProxyRegistrationFlags {
  return {
    registerPedagogyTools:
      typeof input.registerPedagogyTools === 'boolean' ? input.registerPedagogyTools : false,
    registerCurriculumTools:
      typeof input.registerCurriculumTools === 'boolean' ? input.registerCurriculumTools : false,
    registerFigureTools:
      typeof input.registerFigureTools === 'boolean' ? input.registerFigureTools : false,
    registerFreeformFigureTools:
      typeof input.registerFreeformFigureTools === 'boolean'
        ? input.registerFreeformFigureTools
        : false,
    registerGoalTools:
      typeof input.registerGoalTools === 'boolean' ? input.registerGoalTools : false,
    registerLearnerTools:
      typeof input.registerLearnerTools === 'boolean' ? input.registerLearnerTools : false,
    registerTeachingTools:
      typeof input.registerTeachingTools === 'boolean' ? input.registerTeachingTools : false,
    registerMathTools:
      typeof input.registerMathTools === 'boolean' ? input.registerMathTools : false,
  }
}

function resolveBodyRegistrationFlags(
  body: Record<string, unknown>,
  input: ProxyToOpenCodeInput,
): ProxyRegistrationFlags {
  return {
    registerPedagogyTools: resolveRegistration(body, input.registerPedagogyTools),
    registerCurriculumTools: resolveRegistration(body, input.registerCurriculumTools),
    registerFigureTools: resolveRegistration(body, input.registerFigureTools),
    registerFreeformFigureTools: resolveRegistration(body, input.registerFreeformFigureTools),
    registerGoalTools: resolveRegistration(body, input.registerGoalTools),
    registerLearnerTools: resolveRegistration(body, input.registerLearnerTools),
    registerTeachingTools: resolveRegistration(body, input.registerTeachingTools),
    registerMathTools: resolveRegistration(body, input.registerMathTools),
  }
}

export { registerOpenCodeTools, resolveBodyRegistrationFlags, resolveInitialRegistrationFlags }
