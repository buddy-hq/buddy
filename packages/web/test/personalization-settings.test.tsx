import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useForm } from "@tanstack/react-form"
import { SharedPersonalizationPrimaryUseField } from "../src/components/settings/shared-personalization-form"
import { usePersonalizationSettingsAutosave } from "../src/state/personalization-settings"
import { readPersonalization } from "../src/state/project-config-readers"

const SAVED_GLOBAL_CONFIG = {
  personalization: {
    primary_use: "teach",
    preferred_name: "Pat",
  },
}

function PersonalizationHydrationProbe(props: { globalConfig?: Record<string, unknown> }) {
  const form = useForm({
    defaultValues: readPersonalization({}),
    onSubmit: async () => undefined,
  })
  usePersonalizationSettingsAutosave(form, {
    globalConfig: props.globalConfig,
    isPending: props.globalConfig === undefined,
  })

  return (
    <form.Field name="primaryUse">
      {(field) => <output data-testid="primary-use">{field.state.value ?? "unselected"}</output>}
    </form.Field>
  )
}

function PrimaryUseChoiceProbe(props: { onPrimaryUseChange?: () => void }) {
  const form = useForm({
    defaultValues: readPersonalization(SAVED_GLOBAL_CONFIG),
    onSubmit: async () => undefined,
  })

  return (
    <SharedPersonalizationPrimaryUseField
      form={form}
      onPrimaryUseChange={props.onPrimaryUseChange}
    />
  )
}

describe("personalization settings", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    queryClient = new QueryClient()
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    queryClient.clear()
    container.remove()
  })

  test("hydrates the saved primary use when global config arrives", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PersonalizationHydrationProbe />
        </QueryClientProvider>,
      )
    })

    expect(container.querySelector('[data-testid="primary-use"]')?.textContent).toBe("unselected")

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PersonalizationHydrationProbe globalConfig={SAVED_GLOBAL_CONFIG} />
        </QueryClientProvider>,
      )
    })

    expect(container.querySelector('[data-testid="primary-use"]')?.textContent).toBe("teach")
  })

  test("renders a saved primary use as one checked radio choice", async () => {
    await act(async () => {
      root.render(<PrimaryUseChoiceProbe />)
    })

    const choices = container.querySelectorAll('[role="radio"]')
    expect(choices).toHaveLength(2)
    expect(choices[0]?.getAttribute("data-state")).toBe("unchecked")
    expect(choices[1]?.getAttribute("data-state")).toBe("checked")
  })

  test("requests an immediate save when the primary use changes", async () => {
    let changeCount = 0
    await act(async () => {
      root.render(
        <PrimaryUseChoiceProbe
          onPrimaryUseChange={() => {
            changeCount += 1
          }}
        />,
      )
    })

    const learnChoice = container.querySelector<HTMLElement>('[role="radio"][value="learn"]')
    await act(async () => {
      learnChoice?.click()
    })

    expect(changeCount).toBe(1)
    expect(learnChoice?.getAttribute("data-state")).toBe("checked")
  })
})
