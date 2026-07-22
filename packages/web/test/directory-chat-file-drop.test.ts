import { describe, expect, mock, test } from "bun:test"
import { preventDefaultForFileDrag } from "../src/components/directory-chat/directory-chat-file-drop"

function dragEvent(types: string[]) {
  const preventDefault = mock(() => undefined)
  return {
    event: {
      dataTransfer: { types },
      preventDefault,
    },
    preventDefault,
  }
}

describe("directory chat file drops", () => {
  test("cancels the browser default for file drags", () => {
    const input = dragEvent(["Files"])

    expect(preventDefaultForFileDrag(input.event)).toBe(true)
    expect(input.preventDefault).toHaveBeenCalledTimes(1)
  })

  test("leaves non-file drags alone", () => {
    const input = dragEvent(["text/plain"])

    expect(preventDefaultForFileDrag(input.event)).toBe(false)
    expect(input.preventDefault).not.toHaveBeenCalled()
  })
})
