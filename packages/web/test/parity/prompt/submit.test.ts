import { describe, expect, test } from "bun:test"
import { createPromptSubmit, promptSubmitAction } from "../../../src/components/prompt/submit"

describe("prompt submit actions", () => {
  test("submits when there is input and not busy", () => {
    expect(promptSubmitAction({ isBusy: false, value: "echo hi" })).toBe("submit")
  })

  test("aborts when currently busy", () => {
    expect(promptSubmitAction({ isBusy: true, value: "echo hi" })).toBe("abort")
  })

  test("does nothing when input is empty", () => {
    expect(promptSubmitAction({ isBusy: false, value: "   " })).toBe("none")
  })
})

describe("createPromptSubmit", () => {
  test("reads latest accessor values across submits", () => {
    let value = "first"
    const submitted: string[] = []

    const submit = createPromptSubmit({
      value: () => value,
      isBusy: () => false,
      onSubmit: () => submitted.push(value),
      onAbort: () => {
        throw new Error("should not abort")
      },
    })

    submit.handleSubmit({ preventDefault() {} })
    value = "second"
    submit.handleSubmit({ preventDefault() {} })

    expect(submitted).toEqual(["first", "second"])
  })

  test("routes enter key to abort while busy", () => {
    let abortCount = 0

    const submit = createPromptSubmit({
      value: () => "running",
      isBusy: () => true,
      onSubmit: () => {
        throw new Error("should not submit")
      },
      onAbort: () => {
        abortCount += 1
      },
    })

    const action = submit.handleKeyDown({
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
    })

    expect(action).toBe("abort")
    expect(abortCount).toBe(1)
  })

  test("ignores non-submit keyboard events", () => {
    let prevented = false
    let submitCount = 0

    const submit = createPromptSubmit({
      value: () => "hello",
      isBusy: () => false,
      onSubmit: () => {
        submitCount += 1
      },
      onAbort: () => {
        throw new Error("should not abort")
      },
    })

    const action = submit.handleKeyDown({
      key: "Enter",
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {
        prevented = true
      },
    })

    expect(action).toBe("none")
    expect(prevented).toBe(false)
    expect(submitCount).toBe(0)
  })
})
