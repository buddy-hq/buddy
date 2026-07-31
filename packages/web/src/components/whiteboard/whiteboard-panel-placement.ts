/**
 * Where the board's shape-properties panel sits.
 *
 * Excalidraw renders one panel — `.App-menu__left`, a 12.5rem island holding a `.panelColumn` stack
 * of captioned sections. Left placement leaves it exactly as shipped. Bottom placement re-lays that
 * same markup out as a dock: every section, every option, still one click, because the controls are
 * Excalidraw's own. Only the axis and the spacing change.
 *
 * Laying the existing panel out is deliberately preferred over rebuilding the controls against the
 * imperative API. The API route trades a little CSS for a lot of TypeScript, and that TypeScript is
 * where the holes are — per-element-type corner radii, duplicate with bound text and groups, undo
 * grouping. Excalidraw already gets all of it right.
 */

export type WhiteboardPanelPlacement = "left" | "bottom"

export const WHITEBOARD_PANEL_PLACEMENT_LEFT: WhiteboardPanelPlacement = "left"
export const WHITEBOARD_PANEL_PLACEMENT_BOTTOM: WhiteboardPanelPlacement = "bottom"

/** Stock left column, i.e. Excalidraw's own layout untouched. */
export const DEFAULT_WHITEBOARD_PANEL_PLACEMENT = WHITEBOARD_PANEL_PLACEMENT_LEFT

export function toggleWhiteboardPanelPlacement(
  placement: WhiteboardPanelPlacement,
): WhiteboardPanelPlacement {
  return placement === WHITEBOARD_PANEL_PLACEMENT_LEFT
    ? WHITEBOARD_PANEL_PLACEMENT_BOTTOM
    : WHITEBOARD_PANEL_PLACEMENT_LEFT
}

/**
 * Excalidraw parks its zoom and undo/redo cluster at `bottom: 1rem` with `--lg-button-size` tall
 * buttons, so the dock has to clear that button plus both gaps or it lands on top of them.
 */
const DOCK_CLEARANCE = "calc(1rem + var(--lg-button-size) + 0.75rem)"
const DOCK_INLINE_INSET = "1rem"
const DOCK_PADDING = "0.75rem"
const DOCK_RADIUS = "0.75rem"
/** Three bands of caption-over-controls plus padding; past that the dock scrolls, never grows. */
const DOCK_MAX_HEIGHT = "14rem"
const DOCK_COLUMN_GAP = "0.5rem"
const DOCK_ROW_GAP = "0.5rem"
const DOCK_SECTION_PADDING = "0.5rem 0.625rem"
const DOCK_SECTION_RADIUS = "0.5rem"
const DOCK_SECTION_CAPTION_GAP = "0.5rem"
/**
 * Excalidraw spreads its five swatches with `justify-content: space-between` inside a fixed 12.5rem
 * column. Once a section shrinks to its own content there is no slack left to distribute and the
 * swatches collide, so the dock gives them an explicit gap instead.
 */
const DOCK_SWATCH_GAP = "0.375rem"
/**
 * The opacity slider is the one control Excalidraw sizes at `width: 100%`, which has nothing to
 * resolve against once its section shrinks to its own content.
 */
const DOCK_SLIDER_WIDTH = "8rem"

const BOTTOM_SCOPE = `[data-component="whiteboard-canvas"][data-panel-placement="${WHITEBOARD_PANEL_PLACEMENT_BOTTOM}"]`

/**
 * `.App-menu__left` is absolutely positioned and its nearest positioned ancestor is
 * `.layer-ui__wrapper`, which spans the whole board — so these insets resolve against the board,
 * not against the left column that normally holds it.
 *
 * The wrapping `.panelColumn` is what makes this a dock rather than a strip. Each of the thirteen
 * sections keeps its own caption above its own controls and sizes to its content, so the grouping
 * that made the vertical panel readable survives the rotation instead of collapsing into one
 * anonymous line of icons.
 *
 * Bands wrap rather than being fixed at two: pinning the count forces the row wider than the board
 * and clips whatever falls off the end, which silently costs the options it hides. Wrapping trades
 * a band of height for keeping every control reachable in one click, which is the point.
 */
export const WHITEBOARD_PANEL_PLACEMENT_CSS = `
${BOTTOM_SCOPE} .App-menu__left {
  top: auto;
  left: 50%;
  right: auto;
  bottom: ${DOCK_CLEARANCE};
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - ${DOCK_INLINE_INSET} * 2);
  max-height: ${DOCK_MAX_HEIGHT};
  padding: ${DOCK_PADDING};
  border-radius: ${DOCK_RADIUS};
  overflow-x: auto;
  overflow-y: auto;
}

${BOTTOM_SCOPE} .App-menu__left .panelColumn {
  display: flex;
  flex-flow: row wrap;
  align-items: stretch;
  column-gap: ${DOCK_COLUMN_GAP};
  row-gap: ${DOCK_ROW_GAP};
}

/*
 * Sections size to their own controls, and each one sits on its own surface.
 *
 * A vertical panel gets its grouping free: one section per line, so a caption can only belong to
 * what is under it. Wrapped into bands that reading disappears — neighbouring sections sit at the
 * same spacing as the controls inside them, and a caption reads as belonging to whatever is
 * nearest. Giving each section a surface restores the boundary that the line break used to draw,
 * and it survives wrapping, which a divider between siblings cannot: there is no way to suppress
 * one at the start of a wrapped row.
 *
 * Stretching to a common height and pushing controls to the bottom is what keeps them on one line.
 * Not every section carries a caption — Excalidraw's vertical text-align row is its own
 * caption-less section — so aligning the section boxes to the top of the band lands a captioned
 * section's buttons one caption lower than its neighbour's, which is the misalignment that shows
 * up around the text controls.
 */
${BOTTOM_SCOPE} .App-menu__left .panelColumn > * {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: ${DOCK_SECTION_PADDING};
  border-radius: ${DOCK_SECTION_RADIUS};
  background-color: var(--color-surface-low);
}

${BOTTOM_SCOPE} .App-menu__left .panelColumn legend,
${BOTTOM_SCOPE} .App-menu__left .panelColumn .control-label {
  margin-bottom: ${DOCK_SECTION_CAPTION_GAP};
}

${BOTTOM_SCOPE} .App-menu__left .color-picker__top-picks {
  justify-content: flex-start;
  gap: ${DOCK_SWATCH_GAP};
}

${BOTTOM_SCOPE} .App-menu__left .panelColumn input[type="range"] {
  width: ${DOCK_SLIDER_WIDTH};
}
`
