export type AgentQuestionItem = {
  readonly question: string
  readonly header: string
  readonly options: readonly { readonly label: string; readonly description: string }[]
  readonly multiple: boolean
  readonly custom: boolean
}

export type AgentQuestion = {
  readonly id: string
  readonly sessionID: string
  readonly questions: readonly AgentQuestionItem[]
  readonly tool?: { readonly messageID: string; readonly callID: string }
}

export type QuestionScope = { readonly directory: string } | { readonly sessionID: string }

export interface Forms {
  pending(scope: QuestionScope): Promise<AgentQuestion[]>
  answer(
    sessionID: string,
    questionID: string,
    answers: readonly (readonly string[])[],
  ): Promise<void>
  dismiss(sessionID: string, questionID: string): Promise<void>
}
