import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import clientMetadata from "../script/buddy-client-metadata.json"
import { rewriteOpenCodeBranding } from "../script/opencode-branding"

test("brands CRLF checkouts of the real OAuth sources exactly once and emits LF", () => {
  const vendorRoot = path.resolve(import.meta.dir, "../../../vendor/opencode/packages/core/src")
  const pagePath = path.join(vendorRoot, "oauth/page.ts")
  const mcpPath = path.join(vendorRoot, "mcp/oauth.ts")
  const pageSource = readFileSync(pagePath, "utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")
  const mcpSource = readFileSync(mcpPath, "utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")
  const page = rewriteOpenCodeBranding(pagePath, pageSource)
  const mcp = rewriteOpenCodeBranding(mcpPath, mcpSource)

  expect(page.split('const WORDMARK = `<span class="wordmark"')).toHaveLength(2)
  expect(page).toContain("Buddy is now connected to ")
  expect(page).not.toContain('aria-label="OpenCode"')
  expect(page).not.toContain("\r\n")
  expect(mcp.split('logo_uri: "https://hibuddy.in/apple-touch-icon.png"')).toHaveLength(2)
  expect(mcp).toContain('clientInfo: { name: "buddy" }')
  expect(mcp).not.toContain("\r\n")
})

test("brands the current OAuth sources and refuses an upstream snippet change", () => {
  const vendorRoot = path.resolve(import.meta.dir, "../../../vendor/opencode/packages/core/src")
  const pagePath = path.join(vendorRoot, "oauth/page.ts")
  const mcpPath = path.join(vendorRoot, "mcp/oauth.ts")
  const pageSource = readFileSync(pagePath, "utf8")
  const page = rewriteOpenCodeBranding(pagePath.replaceAll("/", "\\"), pageSource)
  const mcp = rewriteOpenCodeBranding(mcpPath, readFileSync(mcpPath, "utf8"))
  const clientMetadataUrl = "https://hibuddy.in/oauth/buddy/client.json"

  expect(page).toContain("Buddy is now connected to ")
  expect(page).toContain("Buddy is now authorized.")
  expect(page).toContain("Buddy couldn't finish connecting to ")
  expect(page).toContain("Buddy couldn't complete authorization.")
  expect(page).toContain("Close this window and try again from Buddy.")
  expect(page).toContain(" · Buddy</title>")
  expect(page).not.toContain("OpenCode is now")
  expect(page).not.toContain('aria-label="OpenCode"')
  expect(mcp).toContain(`export const CLIENT_METADATA_URL = "${clientMetadataUrl}"`)
  expect(clientMetadata.client_id).toBe(clientMetadataUrl)
  expect(clientMetadata.client_name).toBe("Buddy")
  expect(clientMetadata.client_uri).toBe("https://hibuddy.in")
  expect(clientMetadata.logo_uri).toBe("https://hibuddy.in/apple-touch-icon.png")
  expect(mcp).toContain('client_name: "Buddy"')
  expect(mcp).toContain('client_uri: "https://hibuddy.in"')
  expect(mcp).toContain('logo_uri: "https://hibuddy.in/apple-touch-icon.png"')
  expect(mcp).toContain('clientInfo: { name: "buddy" }')
  expect(() => rewriteOpenCodeBranding(
    pagePath,
    pageSource.replace("OpenCode is now authorized.", "Authorization complete."),
  )).toThrow()
})
