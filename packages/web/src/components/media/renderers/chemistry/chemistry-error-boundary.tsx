import { Component, type ReactNode } from "react"

type ChemistryErrorFallbackInput = {
  error: Error
  retry(): void
}

type ChemistryErrorBoundaryProps = {
  children: ReactNode
  fallback(input: ChemistryErrorFallbackInput): ReactNode
  resetKeys: readonly unknown[]
}

type ChemistryErrorBoundaryState = {
  error: Error | null
}

function normalizeChemistryBoundaryError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === "string" && error.trim()) return new Error(error.trim())
  return new Error("The chemistry interface could not be loaded.")
}

function resetKeysChanged(previous: readonly unknown[], current: readonly unknown[]): boolean {
  return (
    previous.length !== current.length ||
    previous.some((value, index) => !Object.is(value, current[index]))
  )
}

export class ChemistryErrorBoundary extends Component<
  ChemistryErrorBoundaryProps,
  ChemistryErrorBoundaryState
> {
  state: ChemistryErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ChemistryErrorBoundaryState {
    return { error: normalizeChemistryBoundaryError(error) }
  }

  componentDidUpdate(previousProps: ChemistryErrorBoundaryProps): void {
    if (this.state.error && resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null })
    }
  }

  private readonly retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    return this.state.error
      ? this.props.fallback({ error: this.state.error, retry: this.retry })
      : this.props.children
  }
}

export type { ChemistryErrorFallbackInput }
