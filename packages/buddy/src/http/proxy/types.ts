export type ProxyRegistrationPredicate = (body: Record<string, unknown>) => boolean

export type ProxyRegistrationOption = boolean | ProxyRegistrationPredicate

export type ProxyRegistrationFlags = {
  registerPedagogyTools: boolean
  registerCurriculumTools: boolean
  registerFigureTools: boolean
  registerFreeformFigureTools: boolean
  registerGoalTools: boolean
  registerLearnerTools: boolean
  registerTeachingTools: boolean
  registerMathTools: boolean
}

export type ProxyToOpenCodeInput = {
  targetPath: string
  transformJsonBody?: (
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  forceBusyAs409?: boolean
  registerPedagogyTools?: ProxyRegistrationOption
  registerCurriculumTools?: ProxyRegistrationOption
  registerFigureTools?: ProxyRegistrationOption
  registerFreeformFigureTools?: ProxyRegistrationOption
  registerGoalTools?: ProxyRegistrationOption
  registerLearnerTools?: ProxyRegistrationOption
  registerTeachingTools?: ProxyRegistrationOption
  registerMathTools?: ProxyRegistrationOption
}

export type FetchOpenCodeInput = {
  directory: string
  method: string
  path: string
  query?: string
  headers?: Headers
  body?: BodyInit
  registerPedagogyTools?: boolean
  registerCurriculumTools?: boolean
  registerFigureTools?: boolean
  registerFreeformFigureTools?: boolean
  registerGoalTools?: boolean
  registerLearnerTools?: boolean
  registerTeachingTools?: boolean
  registerMathTools?: boolean
}
