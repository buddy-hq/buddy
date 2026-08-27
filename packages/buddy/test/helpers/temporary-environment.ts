type EnvironmentOverrides = Readonly<Record<string, string | undefined>>

export type TemporaryEnvironment = {
  [Symbol.dispose]: () => void
}

function setEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

export function temporaryEnvironment(overrides: EnvironmentOverrides): TemporaryEnvironment {
  const originalValues = new Map<string, string | undefined>()

  for (const [name, value] of Object.entries(overrides)) {
    originalValues.set(name, process.env[name])
    setEnvironmentVariable(name, value)
  }

  return {
    [Symbol.dispose]: () => {
      for (const [name, value] of originalValues) {
        setEnvironmentVariable(name, value)
      }
    },
  }
}
