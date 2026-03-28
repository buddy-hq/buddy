import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { OnboardingSetup } from "../src/components/onboarding"

describe("OnboardingSetup", () => {
  test("shows the connected ChatGPT state and hides the free-model fallback", () => {
    const markup = renderToStaticMarkup(
      <OnboardingSetup
        authChoice="chatgpt_plus"
        connectedAuthChoice="chatgpt_plus"
        folderBusy={false}
        onChoose={() => undefined}
        onPickFolder={() => undefined}
      />,
    )

    expect(markup).toContain("Connected")
    expect(markup).not.toContain("Free Models")
    expect(markup).toContain("Choose Folder")
  })
})
