import { Badge } from "@buddy/ui"
import type { GradientAnimationPalette } from "@/components/media/loading/background-gradient-animation"
import { GradientAnimationLoading } from "@/components/media/loading/gradient-animation"

type GradientPreview = {
  id: string
  title: string
  description: string
  palette: GradientAnimationPalette
  tokens: string
}

const GRADIENT_PREVIEWS = [
  {
    id: "default",
    title: "Default",
    description: "Original gradient palette and the fallback used when theme variables are absent.",
    palette: "default",
    tokens: "Fixed RGB fallback palette",
  },
  {
    id: "theme",
    title: "Theme adapted",
    description: "Derives five separated shades from the theme’s primary and accent colors.",
    palette: "theme",
    tokens: "theme-primary-base · theme-accent-base · background-base",
  },
] satisfies GradientPreview[]

export function GradientAnimationLoaderEasel() {
  return (
    <section className="flex size-full min-h-0 overflow-auto bg-background-base p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 self-center">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-strong">Gradient animation loader</h2>
            <Badge variant="outline">Live comparison</Badge>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-text-weak">
            Compare the preserved source treatment with a semantic palette that follows the active
            Buddy theme.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {GRADIENT_PREVIEWS.map((preview) => (
            <article
              key={preview.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-weaker-base bg-surface-base p-3 shadow-sm"
            >
              <header className="flex min-h-12 items-start justify-between gap-3 px-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 className="text-xs font-medium text-text-strong">{preview.title}</h3>
                  <p className="text-[11px] leading-relaxed text-text-weaker">
                    {preview.description}
                  </p>
                </div>
                <Badge variant={preview.palette === "theme" ? "default" : "secondary"}>
                  {preview.palette}
                </Badge>
              </header>

              <div className="relative h-72 overflow-hidden rounded-lg border border-border-weaker-base bg-background-base">
                <GradientAnimationLoading palette={preview.palette} speed="fast" />
              </div>

              <p className="truncate px-1 font-mono text-[10px] text-text-weaker">
                {preview.tokens}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
