import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  hasAbsolutePath,
  normalizeDirectory,
  pickProjectDirectory,
} from "../../../src/lib/directory-picker"

const originalPrompt = window.prompt

beforeEach(() => {
  window.__TAURI__ = undefined
  window.electronAPI = undefined
  Object.defineProperty(window, "prompt", {
    configurable: true,
    value: () => null,
  })
})

afterEach(() => {
  window.__TAURI__ = undefined
  window.electronAPI = undefined
  Object.defineProperty(window, "prompt", {
    configurable: true,
    value: originalPrompt,
  })
})

describe("directory picker parity", () => {
  test("normalizes directory separators", () => {
    expect(normalizeDirectory("/tmp/demo///")).toBe("/tmp/demo")
    expect(normalizeDirectory("C:\\tmp\\demo\\")).toBe("C:/tmp/demo")
  })

  test("detects absolute paths", () => {
    expect(hasAbsolutePath("/tmp/demo")).toBe(true)
    expect(hasAbsolutePath("C:\\tmp\\demo")).toBe(true)
    expect(hasAbsolutePath("tmp/demo")).toBe(false)
  })

  test("uses the electron picker result", async () => {
    window.electronAPI = {
      openDirectoryPickerDialog: async () => ["C:\\repo\\nested\\"],
    }

    await expect(pickProjectDirectory()).resolves.toBe("C:/repo/nested")
  })

  test("does not prompt when desktop bridge exists but user cancels", async () => {
    let promptCalls = 0
    window.electronAPI = {
      openDirectoryPickerDialog: async () => null,
    }
    Object.defineProperty(window, "prompt", {
      configurable: true,
      value: () => {
        promptCalls += 1
        return "/tmp/fallback"
      },
    })

    await expect(pickProjectDirectory()).resolves.toBeNull()
    expect(promptCalls).toBe(0)
  })

  test("falls back to manual prompt and validates absolute paths", async () => {
    Object.defineProperty(window, "prompt", {
      configurable: true,
      value: () => "relative/path",
    })
    await expect(pickProjectDirectory()).rejects.toThrow("Please enter an absolute directory path")

    Object.defineProperty(window, "prompt", {
      configurable: true,
      value: () => "/tmp/manual///",
    })
    await expect(pickProjectDirectory()).resolves.toBe("/tmp/manual")
  })
})
