import { describe, expect, test } from "bun:test"
import { Config } from "../../../src/config/config.js"
import { withRepo } from "../helpers"

describe("parity.config.config", () => {
  test("updates and reads project config values", async () => {
    await withRepo(async (directory) => {
      await Config.updateProject(directory, {
        default_mode: "code-buddy",
        model: "anthropic/k2p5",
        small_model: "anthropic/mini",
      })

      const loaded = await Config.getProject(directory)
      expect(loaded.default_mode).toBe("code-buddy")
      expect(loaded.model).toBe("anthropic/k2p5")
      expect(loaded.small_model).toBe("anthropic/mini")
    })
  })

  test("rejects malformed jsonc config", async () => {
    await withRepo(async (directory) => {
      const previous = process.env.BUDDY_CONFIG
      process.env.BUDDY_CONFIG = `${directory}/broken.jsonc`
      await Bun.write(
        `${directory}/broken.jsonc`,
        [
          "{",
          '  "model": "anthropic/k2p5",',
          '  "default_mode":',
          "}",
        ].join("\n"),
      )

      try {
        await expect(Config.getProject(directory)).rejects.toThrow("JSONC")
      } finally {
        if (previous === undefined) delete process.env.BUDDY_CONFIG
        else process.env.BUDDY_CONFIG = previous
      }
    })
  })
})
