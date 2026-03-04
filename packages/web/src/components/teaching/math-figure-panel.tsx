type MathFigurePanelProps = {
  className?: string
}

export function MathFigurePanel(props: MathFigurePanelProps) {
  return (
    <section className={`flex min-h-0 flex-1 flex-col gap-4 px-6 py-8 ${props.className ?? ""}`}>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Figure Surface</h2>
        <p className="text-sm text-muted-foreground">
          Math Buddy can render figures inline in the transcript when it needs diagrams, graphs, or geometric sketches.
        </p>
        <p className="text-xs text-muted-foreground">
          This surface is a lightweight placeholder for phase 1. There is no dedicated figure canvas or history panel
          yet.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
        Available tools: <code>render_figure</code>, <code>render_freeform_figure</code>.
        <br />
        Ask Math Buddy to draw the next figure and it will appear inline in the chat.
      </div>
    </section>
  )
}
