import path from "node:path"
import type { BunPlugin } from "bun"

type Replacement = {
  readonly original: string
  readonly replacement: () => string
}

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const vendorRoot = path.join(repositoryRoot, "vendor/opencode/packages/core/src")
const wordmark = `// OpenCode wordmark — same path geometry as packages/ui/src/components/logo.tsx (Logo).
const WORDMARK = \`<svg class="wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 234 42" fill="none" aria-label="OpenCode" role="img">
        <path d="M18 30H6V18H18V30Z" fill="var(--oc-icon-weak)" />
        <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="var(--oc-icon-base)" />
        <path d="M48 30H36V18H48V30Z" fill="var(--oc-icon-weak)" />
        <path d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z" fill="var(--oc-icon-base)" />
        <path d="M84 24V30H66V24H84Z" fill="var(--oc-icon-weak)" />
        <path d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z" fill="var(--oc-icon-base)" />
        <path d="M108 36H96V18H108V36Z" fill="var(--oc-icon-weak)" />
        <path d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z" fill="var(--oc-icon-base)" />
        <path d="M144 30H126V18H144V30Z" fill="var(--oc-icon-weak)" />
        <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="var(--oc-icon-strong)" />
        <path d="M168 30H156V18H168V30Z" fill="var(--oc-icon-weak)" />
        <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="var(--oc-icon-strong)" />
        <path d="M198 30H186V18H198V30Z" fill="var(--oc-icon-weak)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="var(--oc-icon-strong)" />
        <path d="M234 24V30H216V24H234Z" fill="var(--oc-icon-weak)" />
        <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="var(--oc-icon-strong)" />
      </svg>\``

const replacements = new Map<string, readonly Replacement[]>([
  [
    path.join(vendorRoot, "oauth/page.ts").replaceAll("\\", "/"),
    [
      {
        original:
          'message: provider ? `OpenCode is now connected to ${escapeHtml(provider)}.` : "OpenCode is now authorized.",',
        replacement: () =>
          'message: provider ? `Buddy is now connected to ${escapeHtml(provider)}.` : "Buddy is now authorized.",',
      },
      {
        original: "`OpenCode couldn't finish connecting to ${escapeHtml(provider)}.`",
        replacement: () => "`Buddy couldn't finish connecting to ${escapeHtml(provider)}.`",
      },
      {
        original: ': "OpenCode couldn\'t complete authorization.",',
        replacement: () => ': "Buddy couldn\'t complete authorization.",',
      },
      {
        original: 'footnote: "Close this window and try again from OpenCode.",',
        replacement: () => 'footnote: "Close this window and try again from Buddy.",',
      },
      {
        original: "<title>${escapeHtml(input.title)} · OpenCode</title>",
        replacement: () => "<title>${escapeHtml(input.title)} · Buddy</title>",
      },
      {
        original:
          'message.textContent=PROVIDER?("OpenCode couldn\'t finish connecting to "+PROVIDER+"."):"OpenCode couldn\'t complete authorization."',
        replacement: () =>
          'message.textContent=PROVIDER?("Buddy couldn\'t finish connecting to "+PROVIDER+"."):"Buddy couldn\'t complete authorization."',
      },
      {
        original: 'footnote.textContent="Close this window and try again from OpenCode."',
        replacement: () => 'footnote.textContent="Close this window and try again from Buddy."',
      },
      {
        original:
          'message.textContent=PROVIDER?("OpenCode is now connected to "+PROVIDER+"."):"OpenCode is now authorized."',
        replacement: () =>
          'message.textContent=PROVIDER?("Buddy is now connected to "+PROVIDER+"."):"Buddy is now authorized."',
      },
      {
        original: wordmark,
        replacement: () =>
          'const WORDMARK = `<span class="wordmark" style="font-size: 1.1875rem; font-weight: 600; letter-spacing: -0.012em; color: var(--oc-text-strong);">Buddy</span>`',
      },
    ],
  ],
  [
    path.join(vendorRoot, "mcp/oauth.ts").replaceAll("\\", "/"),
    [
      {
        original:
          'export const CLIENT_METADATA_URL = "https://opencode.ai/oauth/opencode/client.json"',
        replacement: () =>
          'export const CLIENT_METADATA_URL = "https://hibuddy.in/oauth/buddy/client.json"',
      },
      {
        original: 'client_name: "opencode",',
        replacement: () => 'client_name: "Buddy",',
      },
      {
        original: 'client_uri: "https://opencode.ai",',
        replacement: () =>
          'client_uri: "https://hibuddy.in",\n      logo_uri: "https://hibuddy.in/apple-touch-icon.png",',
      },
      {
        original: 'clientInfo: { name: "opencode" }',
        replacement: () => 'clientInfo: { name: "buddy" }',
      },
    ],
  ],
])

export function rewriteOpenCodeBranding(file: string, source: string): string {
  source = source.replaceAll("\r\n", "\n")
  const resolved = path.resolve(file.replaceAll("\\", "/")).replaceAll("\\", "/")
  const entries = replacements.get(resolved)
  if (!entries) return source
  let contents = source
  for (const { original, replacement } of entries) {
    const matches = source.split(original).length - 1
    if (matches !== 1) {
      throw new Error(
        `OpenCode branding: ${resolved} expected exactly one occurrence of ${JSON.stringify(original)}; found ${matches}`,
      )
    }
    contents = contents.replace(original, () => replacement())
  }
  return contents
}

export const opencodeBrandingPlugin = {
  name: "buddy:opencode-branding",
  setup(build) {
    build.onLoad(
      { filter: /[\\/]core[\\/]src[\\/](?:oauth[\\/]page|mcp[\\/]oauth)\.ts$/u },
      async (args) => ({
        contents: rewriteOpenCodeBranding(args.path, await Bun.file(args.path).text()),
        loader: "ts",
      }),
    )
  },
} satisfies BunPlugin
