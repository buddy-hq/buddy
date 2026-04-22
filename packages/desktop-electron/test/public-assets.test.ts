import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import electronViteConfig from "../electron.vite.config"

const publicDir =
  electronViteConfig.renderer && "publicDir" in electronViteConfig.renderer
    ? electronViteConfig.renderer.publicDir
    : undefined

describe("desktop renderer public assets", () => {
  test("serves the Buddy icon from the package public directory", () => {
    expect(typeof publicDir).toBe("string")

    const iconFile = path.join(publicDir, "buddy-icon.png")
    expect(existsSync(iconFile)).toBe(true)
  })
})
