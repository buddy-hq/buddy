import type { CSSProperties } from "react"
import { cn } from "@buddy/ui"
import { FileTypeIcon, resolveFileTypeIconUrl } from "@/components/files/file-type-icon"
import type { WorkspaceMediaKind } from "@/lib/workspace-file-media"
import { useTheme } from "@/theme"

type Appearance = "light" | "dark"
type Treatment = "before" | "after"
type IconSize = 12 | 14 | 16

type IconSample = {
  readonly fileName: string
  readonly type: string
  readonly family: string
  readonly sourceColor: string
  readonly mediaKind?: WorkspaceMediaKind
}

// These are the library's real fills, except Markdown, which Buddy already themes.
// Spreadsheet metadata deliberately selects the green Excel mark used for media files.
const SAMPLES = [
  {
    fileName: "workshop.md",
    type: "Markdown",
    family: "Pale blue",
    sourceColor: "var(--icon-info-base)",
  },
  {
    fileName: "index.js",
    type: "JavaScript",
    family: "Yellow",
    sourceColor: "#FFCA28",
  },
  {
    fileName: "schema.ts",
    type: "TypeScript",
    family: "Cyan blue",
    sourceColor: "#0288D1",
  },
  {
    fileName: "styles.css",
    type: "CSS",
    family: "Blue",
    sourceColor: "#3074BC",
  },
  {
    fileName: "budget.xlsx",
    type: "Excel",
    family: "Green",
    sourceColor: "#3A9161",
    mediaKind: "spreadsheet",
  },
  {
    fileName: "brief.pdf",
    type: "PDF",
    family: "Red",
    sourceColor: "#F44336",
  },
  {
    fileName: "infra.tf",
    type: "Terraform",
    family: "Purple",
    sourceColor: "#4040B2",
  },
] as const satisfies readonly IconSample[]

const ICON_SIZE_CLASS = {
  12: "size-3",
  14: "size-3.5",
  16: "size-4",
} satisfies Record<IconSize, string>

function SampleIcon(props: {
  sample: IconSample
  treatment: Treatment
  appearance: Appearance
  size: IconSize
  className?: string
}) {
  const className = cn("inline-block shrink-0 object-contain", ICON_SIZE_CLASS[props.size], props.className)
  if (props.treatment === "after") {
    return <FileTypeIcon fileName={props.sample.fileName} mediaKind={props.sample.mediaKind} className={className} />
  }

  const url = resolveFileTypeIconUrl({ fileName: props.sample.fileName, mediaKind: props.sample.mediaKind })
  if (props.sample.type !== "Markdown") return <img src={url} alt="" aria-hidden className={className} />

  // Preserve the pre-change theme-colored Markdown baseline; the after column
  // uses production directly so it cannot drift from the shipped treatment.
  const paint: CSSProperties = {
    backgroundColor: "var(--icon-info-base)",
    maskImage: `url("${url}")`,
    maskSize: "contain",
    maskPosition: "center",
    maskRepeat: "no-repeat",
    WebkitMaskImage: `url("${url}")`,
    WebkitMaskSize: "contain",
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
  }
  return <span aria-hidden className={className} style={paint} />
}

function FileReference(props: {
  sample: IconSample
  treatment: Treatment
  appearance: Appearance
}) {
  return (
    <span className="mx-1 inline-flex max-w-full items-baseline gap-1 align-baseline font-medium text-text-interactive-base">
      <SampleIcon {...props} size={12} className="relative top-px" />
      <span className="truncate">{props.sample.fileName}</span>
    </span>
  )
}

function WorkspaceSample(props: { treatment: Treatment; appearance: Appearance }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border-weaker-base bg-background-base">
      <div className="flex flex-col gap-1 border-b border-border-weaker-base px-4 py-3">
        <h3 className="text-sm font-medium text-text-strong">
          {props.treatment === "before"
            ? "Before · original icons"
            : props.appearance === "light"
              ? "After · production light ink"
              : "After · Markdown matches TypeScript"}
        </h3>
        <p className="text-xs text-text-weak">
          {props.treatment === "before"
            ? "Original glyphs and fills"
            : props.appearance === "light"
              ? "Same shapes, same sizes, deeper color"
              : "Markdown uses TypeScript’s blue; other artwork preserved"}
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-4">
        <p className="text-[11px] text-text-weaker">Tabs · 14 px</p>
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-surface-inset-base p-1">
          {SAMPLES.slice(0, 3).map((sample, index) => (
            <div
              key={sample.fileName}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-xs text-text-weak",
                index === 0 && "bg-surface-raised-base text-text-strong shadow-xs",
              )}
            >
              <SampleIcon sample={sample} {...props} size={14} />
              <span className="truncate">{sample.fileName}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-4">
        <p className="text-[11px] text-text-weaker">Explorer · 16 px</p>
        <div className="rounded-lg bg-surface-raised-base p-1.5">
          {SAMPLES.map((sample, index) => (
            <div
              key={sample.fileName}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-xs text-text-base",
                index === 0 && "bg-surface-raised-strong",
              )}
            >
              <SampleIcon sample={sample} {...props} size={16} />
              <span className="min-w-0 flex-1 truncate">{sample.fileName}</span>
              <span className="text-[10px] text-text-weaker">{sample.type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-weaker-base px-4 py-4">
        <p className="text-[11px] text-text-weaker">Inline references · 12 px</p>
        <div className="rounded-lg bg-surface-inset-base px-3 py-2 text-xs leading-7 text-text-base">
          <p>
            Check{" "}
            {SAMPLES.slice(0, 4).map((sample) => <FileReference key={sample.fileName} sample={sample} {...props} />)}
            before publishing.
          </p>
          <p>
            Compare{" "}
            {SAMPLES.slice(4).map((sample) => <FileReference key={sample.fileName} sample={sample} {...props} />)}
            with the brief.
          </p>
        </div>
      </div>
    </div>
  )
}

function ColorSamples(props: { appearance: Appearance }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-weaker-base">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-surface-raised-base text-text-weak">
          <tr>
            <th className="px-4 py-3 font-medium">Sampled by color</th>
            <th className="px-4 py-3 font-medium">Current fill</th>
            {[12, 14, 16].map((size) => <th key={size} className="px-4 py-3 font-medium">{size} px · before / after</th>)}
          </tr>
        </thead>
        <tbody className="bg-background-base">
          {SAMPLES.map((sample) => (
            <tr key={sample.fileName} className="border-t border-border-weaker-base">
              <td className="px-4 py-2.5">
                <span className="font-medium text-text-strong">{sample.family}</span>
                <span className="ml-2 text-text-weak">{sample.type}</span>
              </td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-text-weak">
                {sample.type === "Markdown" ? "icon-info-base" : sample.sourceColor}
              </td>
              {([12, 14, 16] satisfies IconSize[]).map((size) => (
                <td key={size} className="px-4 py-2.5">
                  <div className="flex h-5 items-center gap-3">
                    <SampleIcon sample={sample} treatment="before" appearance={props.appearance} size={size} />
                    <span aria-hidden className="text-text-weaker">/</span>
                    <SampleIcon sample={sample} treatment="after" appearance={props.appearance} size={size} />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Compare real file marks at tab, explorer, and inline sizes across light and dark Buddy surfaces. */
export function FileIconContrastEasel() {
  const { mode, themeId, themes } = useTheme()

  // Use the same root theme as the surfaces. Local raw-token overrides cannot
  // retarget Tailwind's inherited --color-* aliases, which resolve at the root.
  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-background-base">
      <div className="flex flex-col gap-6 bg-background-base p-6 text-text-base">
        <header className="flex max-w-3xl flex-col gap-2">
          <p className="text-[11px] text-text-weaker">
            Issue 24 · {mode === "light" ? "Light" : "Dark"} mode · {themes[themeId]?.name ?? themeId}
          </p>
          <h1 className="text-lg font-semibold text-text-strong">File icons · before and after</h1>
          <p className="text-sm leading-relaxed text-text-weak">
            Both columns use the selected Easel theme. Light mode deepens Markdown, yellow,
            blue, green and red at their actual sizes. In dark mode, Markdown matches
            TypeScript’s blue and other artwork stays original. Switch Light or Dark in the
            toolbar to compare each appearance.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          <WorkspaceSample treatment="before" appearance={mode} />
          <WorkspaceSample treatment="after" appearance={mode} />
        </div>
        <ColorSamples appearance={mode} />
        <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
          Production treatment: the existing asset shapes with theme-aware ink. Markdown uses
          the strong info color in light mode; the other fills mix with the theme’s text ink.
          JavaScript gets the most depth, and the purple mark keeps its original fill.
          In dark mode, Markdown uses TypeScript’s original blue (#0288D1); the other icons
          keep their original fills, including in the size matrix.
        </p>
      </div>
    </div>
  )
}
