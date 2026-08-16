import { Component, type ReactNode } from "react"

type ChemistryErrorFallbackInput = {
  error: Error
  retry(): void
}

type TBoundaryResetKey = string | number | boolean | bigint | symbol | null | undefined | object

type ChemistryErrorBoundaryProps = {
  children: ReactNode
  fallback(input: ChemistryErrorFallbackInput): ReactNode
  resetKeys: readonly TBoundaryResetKey[]
}

type ChemistryErrorBoundaryState = {
  error: Error | null
  resetKeys: readonly TBoundaryResetKey[]
}

type TBoundaryFailure = Error | string

function parseBoundaryFailure(error: TBoundaryFailure): Error {
  if (error instanceof Error) return error
  return new Error(error.trim() || "The chemistry interface could not be loaded.")
}

function resetKeysChanged(
  previous: readonly TBoundaryResetKey[],
  current: readonly TBoundaryResetKey[],
): boolean {
  return (
    previous.length !== current.length ||
    previous.some((value, index) => !Object.is(value, current[index]))
  )
}

export class ChemistryErrorBoundary extends Component<
  ChemistryErrorBoundaryProps,
  ChemistryErrorBoundaryState
> {
  state: ChemistryErrorBoundaryState = { error: null, resetKeys: [] }

  static getDerivedStateFromError(
    error: TBoundaryFailure,
  ): Pick<ChemistryErrorBoundaryState, "error"> {
    return { error: parseBoundaryFailure(error) }
  }

  static getDerivedStateFromProps(
    props: ChemistryErrorBoundaryProps,
    state: ChemistryErrorBoundaryState,
  ): Partial<ChemistryErrorBoundaryState> | null {
    if (!resetKeysChanged(state.resetKeys, props.resetKeys)) {
      return null
    }
    return {
      error: null,
      resetKeys: props.resetKeys,
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
