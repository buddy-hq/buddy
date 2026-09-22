import { create } from "zustand"

type ChoiceDialogRequest<TInput, TChoice> = TInput & {
  id: number
  resolve: (choice: TChoice) => void
}

export type ChoiceDialogState<TInput, TChoice> = {
  nextRequestID: number
  request: ChoiceDialogRequest<TInput, TChoice> | undefined
  requestChoice(input: TInput): Promise<TChoice>
  resolveRequest(choice: TChoice): void
}

export function createChoiceDialogStore<TInput extends object, TChoice>(cancelChoice: TChoice) {
  return create<ChoiceDialogState<TInput, TChoice>>((set, get) => ({
    nextRequestID: 1,
    request: undefined,
    requestChoice: (input) =>
      new Promise((resolve) => {
        get().request?.resolve(cancelChoice)
        const id = get().nextRequestID
        set({
          nextRequestID: id + 1,
          request: { ...input, id, resolve },
        })
      }),
    resolveRequest: (choice) => {
      const current = get().request
      if (!current) return
      set({ request: undefined })
      current.resolve(choice)
    },
  }))
}
