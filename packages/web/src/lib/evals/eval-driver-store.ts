import { create } from "zustand"

export type EvalDriver = {
  directory: string
  startChat: () => Promise<void>
  send: (text: string) => Promise<void>
  selectModel: (model: string) => void
  selectThinking: (thinking: string) => void
  resetBench: () => Promise<void>
}

type EvalDriverState = {
  driver: EvalDriver | undefined
}

export const useEvalDriverStore = create<EvalDriverState>(() => ({
  driver: undefined,
}))

export function registerEvalDriver(driver: EvalDriver) {
  useEvalDriverStore.setState({ driver })
  return () => {
    if (useEvalDriverStore.getState().driver !== driver) return
    useEvalDriverStore.setState({ driver: undefined })
  }
}

export function getEvalDriver() {
  return useEvalDriverStore.getState().driver
}
