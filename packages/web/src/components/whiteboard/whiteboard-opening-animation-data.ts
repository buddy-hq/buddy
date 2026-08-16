/**
 * Hand-authored Lottie (bodymovin) data for the whiteboard "opening" state.
 *
 * The pane this fills is large, so the animation is a *composition* that occupies it —
 * a diagram assembling itself — rather than a single stroke lost in the middle. It is a
 * preview of the Excalidraw board about to appear: rounded nodes, curved bezier
 * connectors, everything drawn with eased trim paths. No pen, no mascot, no literal
 * depiction of the act; the drawing itself carries "Buddy is drawing".
 *
 * Every shape is pure white. The host tints the rendered SVG through `currentColor`
 * (see `whiteboard-opening-lottie.tsx`), so one animation follows every Buddy theme
 * instead of shipping per-theme JSON. Depth comes from opacity, never from hue.
 *
 * Builders return fresh objects on every call: lottie-web mutates the animation data
 * it is handed, so two players must never share one object.
 */

const LOTTIE_FORMAT_VERSION = "5.9.0"
const FRAMES_PER_SECOND = 30
const STAGE_WIDTH = 480
const STAGE_HEIGHT = 300

const FIGURE_LAYER_TYPE = 4
const LINE_CAP_ROUND = 2
const LINE_JOIN_ROUND = 2
const TRIM_SIMULTANEOUSLY = 1
const FILL_RULE_NON_ZERO = 1
const NO_AUTO_ORIENT = 0
const NO_3D = 0
const NORMAL_BLEND = 0
const NO_TIME_STRETCH = 1

const INK_WHITE = [1, 1, 1, 1]
const FULL_OPACITY = 100
const NO_OPACITY = 0
const NO_ROTATION = 0
const IDENTITY_SCALE = [100, 100]
const IDENTITY_SCALE_3D = [100, 100, 100]
const ORIGIN_2D = [0, 0]
const ORIGIN_3D = [0, 0, 0]

/**
 * Cubic-bezier easing, expressed the way Lottie stores it: `o` is the outgoing control
 * point of the starting keyframe, `i` the incoming control point of the next — together
 * `cubic-bezier(o.x, o.y, i.x, i.y)`.
 */
/** cubic-bezier(0.32, 0, 0.18, 1) — a stroke that leaves quickly and lands softly. */
const DRAW_EASE = { o: { x: [0.32], y: [0] }, i: { x: [0.18], y: [1] } }
/** cubic-bezier(0.2, 0.9, 0.2, 1) — near-instant start, long settle. For scale entrances. */
const ENTER_EASE = { o: { x: [0.2], y: [0.9] }, i: { x: [0.2], y: [1] } }
/** cubic-bezier(0.4, 0, 0.6, 1) — symmetric, for opacity. */
const FADE_EASE = { o: { x: [0.4], y: [0] }, i: { x: [0.6], y: [1] } }

type LottieVector = [number, number]

type LottiePathNode = {
  at: LottieVector
  /** Control handle entering `at`, relative to it. */
  enter: LottieVector
  /** Control handle leaving `at`, relative to it. */
  exit: LottieVector
}

type LottieBezierPath = {
  i: LottieVector[]
  o: LottieVector[]
  v: LottieVector[]
  c: boolean
}

type LottieEasing = { i: { x: number[]; y: number[] }; o: { x: number[]; y: number[] } }

type LottieKeyframe = {
  t: number
  s: number[]
  i?: { x: number[]; y: number[] }
  o?: { x: number[]; y: number[] }
}

type LottieScalar = { a: 0; k: number } | { a: 1; k: LottieKeyframe[] }
type LottieMultiValue = { a: 0; k: number[] } | { a: 1; k: LottieKeyframe[] }

type LottiePathItem = {
  ty: "sh"
  ks: { a: 0; k: LottieBezierPath }
  nm: string
}

type LottieRectItem = {
  ty: "rc"
  p: LottieMultiValue
  s: LottieMultiValue
  r: LottieScalar
  nm: string
}

type LottieEllipseItem = {
  ty: "el"
  p: LottieMultiValue
  s: LottieMultiValue
  nm: string
}

type LottieStrokeItem = {
  ty: "st"
  c: LottieMultiValue
  o: LottieScalar
  w: LottieScalar
  lc: number
  lj: number
  nm: string
}

type LottieFillItem = {
  ty: "fl"
  c: LottieMultiValue
  o: LottieScalar
  r: number
  nm: string
}

type LottieTrimItem = {
  ty: "tm"
  s: LottieScalar
  e: LottieScalar
  o: LottieScalar
  m: number
  nm: string
}

type LottieGroupTransform = {
  ty: "tr"
  p: LottieMultiValue
  a: LottieMultiValue
  s: LottieMultiValue
  r: LottieScalar
  o: LottieScalar
  nm: string
}

type TLottieMarkItem =
  | LottiePathItem
  | LottieRectItem
  | LottieEllipseItem
  | LottieStrokeItem
  | LottieFillItem
  | LottieTrimItem
  | LottieGroupTransform

type LottieGroup = {
  ty: "gr"
  it: TLottieMarkItem[]
  nm: string
}

type TLottieFigureLayer = {
  ddd: number
  ind: number
  ty: number
  nm: string
  sr: number
  ks: {
    o: LottieScalar
    r: LottieScalar
    p: LottieMultiValue
    a: LottieMultiValue
    s: LottieMultiValue
  }
  ao: number
  "shapes": LottieGroup[]
  ip: number
  op: number
  st: number
  bm: number
}

export type LottieAnimationData = {
  v: string
  fr: number
  ip: number
  op: number
  w: number
  h: number
  nm: string
  ddd: number
  assets: never[]
  layers: TLottieFigureLayer[]
}

type TimeSpan = { start: number; end: number }
/** When the whole composition wipes itself so the loop can start over. */
type ClearSpan = { hold: number; end: number }

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

function fixed(value: number): LottieScalar {
  return { a: 0, k: value }
}

function fixedVector(value: number[]): LottieMultiValue {
  return { a: 0, k: [...value] }
}

function keyframe(t: number, value: number[], easing?: LottieEasing): LottieKeyframe {
  if (!easing) return { t, s: value }
  return { t, s: value, i: { ...easing.i }, o: { ...easing.o } }
}

/** Trim-path progress that holds at 0 before `start` and at 100 after `end`. */
function drawProgress(span: TimeSpan): LottieScalar {
  return { a: 1, k: [keyframe(span.start, [0], DRAW_EASE), keyframe(span.end, [100])] }
}

/** Fades in as its shape starts drawing, holds, then clears for the loop. */
function appearThenClear(input: {
  peak: number
  appear: TimeSpan
  clear: ClearSpan
}): LottieScalar {
  return {
    a: 1,
    k: [
      keyframe(input.appear.start, [NO_OPACITY], FADE_EASE),
      keyframe(input.appear.end, [input.peak], FADE_EASE),
      keyframe(input.clear.hold, [input.peak], FADE_EASE),
      keyframe(input.clear.end, [NO_OPACITY]),
    ],
  }
}

/** A gentle scale settle so nodes arrive rather than snap into existence. */
function settleScale(input: { span: TimeSpan; from: number }): LottieMultiValue {
  return {
    a: 1,
    k: [
      keyframe(input.span.start, [input.from, input.from], ENTER_EASE),
      keyframe(input.span.end, [...IDENTITY_SCALE]),
    ],
  }
}

// ---------------------------------------------------------------------------
// Path construction — everything curved, nothing elbowed
// ---------------------------------------------------------------------------

function node(at: LottieVector, enter: LottieVector, exit: LottieVector): LottiePathNode {
  return { at, enter, exit }
}

function curvedPath(nodes: LottiePathNode[]): LottieBezierPath {
  return {
    i: nodes.map((item) => [item.enter[0], item.enter[1]] satisfies LottieVector),
    o: nodes.map((item) => [item.exit[0], item.exit[1]] satisfies LottieVector),
    v: nodes.map((item) => [item.at[0], item.at[1]] satisfies LottieVector),
    c: false,
  }
}

function flatHandles(): LottieVector[] {
  return [
    [0, 0],
    [0, 0],
  ]
}

function linePath(from: LottieVector, to: LottieVector): LottieBezierPath {
  return {
    i: flatHandles(),
    o: flatHandles(),
    v: [
      [from[0], from[1]],
      [to[0], to[1]],
    ],
    c: false,
  }
}

// ---------------------------------------------------------------------------
// Shape + layer assembly
// ---------------------------------------------------------------------------

function strokeItem(width: number, name: string, opacity = FULL_OPACITY): LottieStrokeItem {
  return {
    ty: "st",
    c: fixedVector(INK_WHITE),
    o: fixed(opacity),
    w: fixed(width),
    lc: LINE_CAP_ROUND,
    lj: LINE_JOIN_ROUND,
    nm: name,
  }
}

function fillItem(name: string, opacity = FULL_OPACITY): LottieFillItem {
  return {
    ty: "fl",
    c: fixedVector(INK_WHITE),
    o: fixed(opacity),
    r: FILL_RULE_NON_ZERO,
    nm: name,
  }
}

function trimItem(draw: TimeSpan): LottieTrimItem {
  return {
    ty: "tm",
    s: fixed(0),
    e: drawProgress(draw),
    o: fixed(0),
    m: TRIM_SIMULTANEOUSLY,
    nm: "Trim",
  }
}

function groupTransform(input?: {
  anchor: LottieVector
  scale: LottieMultiValue
}): LottieGroupTransform {
  return {
    ty: "tr",
    p: fixedVector(input ? input.anchor : ORIGIN_2D),
    a: fixedVector(input ? input.anchor : ORIGIN_2D),
    s: input ? input.scale : fixedVector(IDENTITY_SCALE),
    r: fixed(NO_ROTATION),
    o: fixed(FULL_OPACITY),
    nm: "Transform",
  }
}

function group(name: string, items: TLottieMarkItem[]): LottieGroup {
  return { ty: "gr", it: items, nm: name }
}

function figureLayer(input: {
  index: number
  name: string
  opacity: LottieScalar
  duration: number
  groups: LottieGroup[]
}): TLottieFigureLayer {
  return {
    ddd: NO_3D,
    ind: input.index,
    ty: FIGURE_LAYER_TYPE,
    nm: input.name,
    sr: NO_TIME_STRETCH,
    ks: {
      o: input.opacity,
      r: fixed(NO_ROTATION),
      p: fixedVector(ORIGIN_3D),
      a: fixedVector(ORIGIN_3D),
      s: fixedVector(IDENTITY_SCALE_3D),
    },
    ao: NO_AUTO_ORIENT,
    "shapes": input.groups,
    ip: 0,
    op: input.duration,
    st: 0,
    bm: NORMAL_BLEND,
  }
}

function animation(input: {
  name: string
  duration: number
  layers: TLottieFigureLayer[]
}): LottieAnimationData {
  return {
    v: LOTTIE_FORMAT_VERSION,
    fr: FRAMES_PER_SECOND,
    ip: 0,
    op: input.duration,
    w: STAGE_WIDTH,
    h: STAGE_HEIGHT,
    nm: input.name,
    ddd: NO_3D,
    assets: [],
    layers: input.layers,
  }
}

// ---------------------------------------------------------------------------
// Diagram vocabulary — rounded cards, curved connectors, content lines
// ---------------------------------------------------------------------------

/** How long any element takes to reach full opacity once it starts drawing. */
const FADE_IN_FRAMES = 8

const INK = {
  outlineWidth: 3,
  connectorWidth: 3,
  contentWidth: 3,
  contentOpacity: 46,
  connectorOpacity: 74,
  nodeScaleFrom: 93,
} as const

const CONTENT_LINE = {
  gap: 16,
  widthRatios: [0.54, 0.34],
} as const

type DiagramCard = {
  center: LottieVector
  size: LottieVector
  radius: number
  outline: TimeSpan
  content: TimeSpan
}

/** Two short rounded strokes standing in for text, so a card reads as filled in. */
function contentLineGroup(card: DiagramCard): LottieGroup {
  const [cx, cy] = card.center
  const top = cy - (CONTENT_LINE.gap * (CONTENT_LINE.widthRatios.length - 1)) / 2
  return group("Content", [
    ...CONTENT_LINE.widthRatios.map((ratio, index) => {
      const half = (card.size[0] * ratio) / 2
      const y = top + index * CONTENT_LINE.gap
      return {
        ty: "sh" as const,
        ks: { a: 0 as const, k: linePath([cx - half, y], [cx + half, y]) },
        nm: `Line ${index + 1}`,
      }
    }),
    strokeItem(INK.contentWidth, "Stroke", INK.contentOpacity),
    trimItem(card.content),
    groupTransform(),
  ])
}

function cardLayer(input: {
  index: number
  name: string
  card: DiagramCard
  clear: ClearSpan
  duration: number
}): TLottieFigureLayer {
  const { card } = input
  return figureLayer({
    index: input.index,
    name: input.name,
    opacity: appearThenClear({
      peak: FULL_OPACITY,
      appear: { start: card.outline.start, end: card.outline.start + FADE_IN_FRAMES },
      clear: input.clear,
    }),
    duration: input.duration,
    groups: [
      group("Outline", [
        {
          ty: "rc",
          p: fixedVector([...card.center]),
          s: fixedVector([...card.size]),
          r: fixed(card.radius),
          nm: "Rect",
        },
        strokeItem(INK.outlineWidth, "Stroke"),
        trimItem(card.outline),
        groupTransform({
          anchor: card.center,
          scale: settleScale({ span: card.outline, from: INK.nodeScaleFrom }),
        }),
      ]),
      contentLineGroup(card),
    ],
  })
}

type Connector = {
  nodes: LottiePathNode[]
  draw: TimeSpan
}

function connectorLayer(input: {
  index: number
  name: string
  connectors: Connector[]
  clear: ClearSpan
  duration: number
}): TLottieFigureLayer {
  const firstStart = Math.min(...input.connectors.map((item) => item.draw.start))
  return figureLayer({
    index: input.index,
    name: input.name,
    opacity: appearThenClear({
      peak: INK.connectorOpacity,
      appear: { start: firstStart, end: firstStart + FADE_IN_FRAMES },
      clear: input.clear,
    }),
    duration: input.duration,
    groups: input.connectors.map((connector, index) =>
      group(`Connector ${index + 1}`, [
        { ty: "sh", ks: { a: 0, k: curvedPath(connector.nodes) }, nm: "Path" },
        strokeItem(INK.connectorWidth, "Stroke"),
        trimItem(connector.draw),
        groupTransform(),
      ]),
    ),
  })
}

// ---------------------------------------------------------------------------
// Variant A — "Flow" : four rounded cards wired into a loop
// ---------------------------------------------------------------------------

const FLOW = {
  duration: 168,
  restFrame: 122,
  clear: { hold: 142, end: 166 },
  cards: [
    {
      center: [96, 72],
      size: [136, 62],
      radius: 20,
      outline: { start: 0, end: 18 },
      content: { start: 14, end: 26 },
    },
    {
      center: [312, 72],
      size: [136, 62],
      radius: 20,
      outline: { start: 30, end: 48 },
      content: { start: 44, end: 56 },
    },
    {
      center: [384, 226],
      size: [136, 62],
      radius: 20,
      outline: { start: 60, end: 78 },
      content: { start: 74, end: 86 },
    },
    {
      center: [136, 226],
      size: [136, 62],
      radius: 20,
      outline: { start: 90, end: 108 },
      content: { start: 104, end: 116 },
    },
  ] satisfies DiagramCard[],
  connectors: [
    {
      nodes: [node([164, 72], [0, 0], [32, -18]), node([244, 72], [-32, -18], [0, 0])],
      draw: { start: 18, end: 34 },
    },
    {
      nodes: [node([312, 103], [0, 0], [0, 40]), node([384, 195], [-38, -30], [0, 0])],
      draw: { start: 48, end: 66 },
    },
    {
      nodes: [node([316, 226], [0, 0], [-34, 20]), node([204, 226], [34, 20], [0, 0])],
      draw: { start: 78, end: 94 },
    },
    {
      nodes: [node([136, 195], [0, 0], [-18, -34]), node([96, 103], [16, 34], [0, 0])],
      draw: { start: 108, end: 126 },
    },
  ] satisfies Connector[],
} as const

export function buildFlowAnimation(): LottieAnimationData {
  const clear = { ...FLOW.clear }
  return animation({
    name: "Flow",
    duration: FLOW.duration,
    layers: [
      ...FLOW.cards.map((card, index) =>
        cardLayer({
          index: index + 1,
          name: `Card ${index + 1}`,
          card: { ...card },
          clear,
          duration: FLOW.duration,
        }),
      ),
      connectorLayer({
        index: FLOW.cards.length + 1,
        name: "Connectors",
        connectors: FLOW.connectors.map((item) => ({ ...item })),
        clear,
        duration: FLOW.duration,
      }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Variant B — "Branch" : a centre card sprouts four curved branches
// ---------------------------------------------------------------------------

const BRANCH = {
  duration: 156,
  restFrame: 112,
  clear: { hold: 130, end: 154 },
  cards: [
    {
      center: [240, 150],
      size: [156, 68],
      radius: 34,
      outline: { start: 0, end: 22 },
      content: { start: 16, end: 30 },
    },
    {
      center: [76, 62],
      size: [112, 48],
      radius: 24,
      outline: { start: 40, end: 58 },
      content: { start: 52, end: 64 },
    },
    {
      center: [404, 62],
      size: [112, 48],
      radius: 24,
      outline: { start: 58, end: 76 },
      content: { start: 70, end: 82 },
    },
    {
      center: [76, 238],
      size: [112, 48],
      radius: 24,
      outline: { start: 76, end: 94 },
      content: { start: 88, end: 100 },
    },
    {
      center: [404, 238],
      size: [112, 48],
      radius: 24,
      outline: { start: 94, end: 112 },
      content: { start: 106, end: 118 },
    },
  ] satisfies DiagramCard[],
  connectors: [
    {
      nodes: [node([162, 150], [0, 0], [-30, -34]), node([132, 62], [26, 30], [0, 0])],
      draw: { start: 26, end: 46 },
    },
    {
      nodes: [node([318, 150], [0, 0], [30, -34]), node([348, 62], [-26, 30], [0, 0])],
      draw: { start: 44, end: 64 },
    },
    {
      nodes: [node([162, 150], [0, 0], [-30, 34]), node([132, 238], [26, -30], [0, 0])],
      draw: { start: 62, end: 82 },
    },
    {
      nodes: [node([318, 150], [0, 0], [30, 34]), node([348, 238], [-26, -30], [0, 0])],
      draw: { start: 80, end: 100 },
    },
  ] satisfies Connector[],
} as const

export function buildBranchAnimation(): LottieAnimationData {
  const clear = { ...BRANCH.clear }
  return animation({
    name: "Branch",
    duration: BRANCH.duration,
    layers: [
      ...BRANCH.cards.map((card, index) =>
        cardLayer({
          index: index + 1,
          name: index === 0 ? "Centre card" : `Branch card ${index}`,
          card: { ...card },
          clear,
          duration: BRANCH.duration,
        }),
      ),
      connectorLayer({
        index: BRANCH.cards.length + 1,
        name: "Branches",
        connectors: BRANCH.connectors.map((item) => ({ ...item })),
        clear,
        duration: BRANCH.duration,
      }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Variant C — "Curve" : a smooth chart draws across a soft baseline
// ---------------------------------------------------------------------------

const CURVE = {
  duration: 152,
  restFrame: 106,
  clear: { hold: 126, end: 150 },
  baselineWidth: 3,
  baselineOpacity: 32,
  baseline: {
    from: [52, 256] satisfies LottieVector,
    to: [436, 256] satisfies LottieVector,
  },
  baselineDraw: { start: 0, end: 24 },
  curveWidth: 4,
  curve: [
    node([60, 214], [0, 0], [54, -4]),
    node([166, 152], [-46, 28], [48, -30]),
    node([272, 172], [-42, -18], [46, 22]),
    node([382, 72], [-50, 38], [0, 0]),
  ] satisfies LottiePathNode[],
  curveDraw: { start: 16, end: 92 },
  ghostWidth: 3,
  ghostOpacity: 26,
  ghost: [
    node([60, 240], [0, 0], [54, -6]),
    node([166, 202], [-44, 20], [46, -22]),
    node([272, 214], [-44, -8], [48, 10]),
    node([382, 156], [-52, 30], [0, 0]),
  ] satisfies LottiePathNode[],
  ghostDraw: { start: 34, end: 110 },
  dotSize: [15, 15] satisfies LottieVector,
  dotScaleFrom: 30,
  dots: [
    { center: [166, 152] satisfies LottieVector, appear: { start: 44, end: 56 } },
    { center: [272, 172] satisfies LottieVector, appear: { start: 62, end: 74 } },
    { center: [382, 72] satisfies LottieVector, appear: { start: 88, end: 100 } },
  ],
} as const

export function buildCurveAnimation(): LottieAnimationData {
  const clear = { ...CURVE.clear }

  const dotLayers = CURVE.dots.map((dot, index) =>
    figureLayer({
      index: index + 1,
      name: `Point ${index + 1}`,
      opacity: appearThenClear({ peak: FULL_OPACITY, appear: dot.appear, clear }),
      duration: CURVE.duration,
      groups: [
        group(`Dot ${index + 1}`, [
          {
            ty: "el",
            p: fixedVector([...dot.center]),
            s: fixedVector([...CURVE.dotSize]),
            nm: "Ellipse",
          },
          fillItem("Fill"),
          groupTransform({
            anchor: dot.center,
            scale: settleScale({ span: dot.appear, from: CURVE.dotScaleFrom }),
          }),
        ]),
      ],
    }),
  )

  const curveLayer = figureLayer({
    index: dotLayers.length + 1,
    name: "Curve",
    opacity: appearThenClear({
      peak: FULL_OPACITY,
      appear: { start: CURVE.curveDraw.start, end: CURVE.curveDraw.start + FADE_IN_FRAMES },
      clear,
    }),
    duration: CURVE.duration,
    groups: [
      group("Curve", [
        {
          ty: "sh",
          ks: { a: 0, k: curvedPath(CURVE.curve.map((item) => ({ ...item }))) },
          nm: "Path",
        },
        strokeItem(CURVE.curveWidth, "Stroke"),
        trimItem({ ...CURVE.curveDraw }),
        groupTransform(),
      ]),
    ],
  })

  const ghostLayer = figureLayer({
    index: dotLayers.length + 2,
    name: "Second series",
    opacity: appearThenClear({
      peak: CURVE.ghostOpacity,
      appear: { start: CURVE.ghostDraw.start, end: CURVE.ghostDraw.start + FADE_IN_FRAMES },
      clear,
    }),
    duration: CURVE.duration,
    groups: [
      group("Ghost", [
        {
          ty: "sh",
          ks: { a: 0, k: curvedPath(CURVE.ghost.map((item) => ({ ...item }))) },
          nm: "Path",
        },
        strokeItem(CURVE.ghostWidth, "Stroke"),
        trimItem({ ...CURVE.ghostDraw }),
        groupTransform(),
      ]),
    ],
  })

  const baselineLayer = figureLayer({
    index: dotLayers.length + 3,
    name: "Baseline",
    opacity: appearThenClear({
      peak: CURVE.baselineOpacity,
      appear: { start: CURVE.baselineDraw.start, end: CURVE.baselineDraw.start + FADE_IN_FRAMES },
      clear,
    }),
    duration: CURVE.duration,
    groups: [
      group("Baseline", [
        {
          ty: "sh",
          ks: { a: 0, k: linePath([...CURVE.baseline.from], [...CURVE.baseline.to]) },
          nm: "Path",
        },
        strokeItem(CURVE.baselineWidth, "Stroke"),
        trimItem({ ...CURVE.baselineDraw }),
        groupTransform(),
      ]),
    ],
  })

  return animation({
    name: "Curve",
    duration: CURVE.duration,
    layers: [...dotLayers, curveLayer, ghostLayer, baselineLayer],
  })
}

// ---------------------------------------------------------------------------
// Variant registry
// ---------------------------------------------------------------------------

export type WhiteboardOpeningVariantID = "flow" | "branch" | "curve"

export type WhiteboardOpeningVariant = {
  id: WhiteboardOpeningVariantID
  title: string
  concept: string
  /** Frame shown when the viewer prefers reduced motion — the composition complete. */
  restFrame: number
  build: () => LottieAnimationData
}

/** Registry order is also the order the shipped sequence plays them in. */
export const WHITEBOARD_OPENING_VARIANTS: WhiteboardOpeningVariant[] = [
  {
    id: "flow",
    title: "Flow",
    concept:
      "Four rounded cards wire themselves into a loop with curved connectors, each filling in two content lines. Occupies the full pane and previews exactly what lands on the board.",
    restFrame: FLOW.restFrame,
    build: buildFlowAnimation,
  },
  {
    id: "branch",
    title: "Branch",
    concept:
      "A pill-shaped centre card sprouts four curved branches to smaller cards. Symmetric, so it holds a very wide pane without looking bottom-heavy.",
    restFrame: BRANCH.restFrame,
    build: buildBranchAnimation,
  },
  {
    id: "curve",
    title: "Curve",
    concept:
      "A smooth two-series chart draws across a soft baseline with points settling in. The calmest of the three and the least literal about structure.",
    restFrame: CURVE.restFrame,
    build: buildCurveAnimation,
  },
]

export function whiteboardOpeningVariant(id: WhiteboardOpeningVariantID): WhiteboardOpeningVariant {
  const found = WHITEBOARD_OPENING_VARIANTS.find((variant) => variant.id === id)
  if (!found) throw new Error(`Unknown whiteboard opening variant: ${id}`)
  return found
}

// ---------------------------------------------------------------------------
// Sequencing — all three compositions on one timeline
// ---------------------------------------------------------------------------

/**
 * Empty-stage beat between compositions, and between the last one and the loop back to
 * the first, so every changeover reads with the same rhythm.
 */
const SEQUENCE_GAP_FRAMES = 14

function shiftKeyframeList(frames: LottieKeyframe[], offset: number): void {
  for (const frame of frames) {
    frame.t += offset
  }
}

function shiftScalarTimes(value: LottieScalar, offset: number): void {
  if (value.a === 1) shiftKeyframeList(value.k, offset)
}

function shiftMultiValueTimes(value: LottieMultiValue, offset: number): void {
  if (value.a === 1) shiftKeyframeList(value.k, offset)
}

function shiftMarkItemTimes(item: TLottieMarkItem, offset: number): void {
  switch (item.ty) {
    case "sh":
      return
    case "rc":
      shiftMultiValueTimes(item.p, offset)
      shiftMultiValueTimes(item.s, offset)
      shiftScalarTimes(item.r, offset)
      return
    case "el":
      shiftMultiValueTimes(item.p, offset)
      shiftMultiValueTimes(item.s, offset)
      return
    case "st":
      shiftMultiValueTimes(item.c, offset)
      shiftScalarTimes(item.o, offset)
      shiftScalarTimes(item.w, offset)
      return
    case "fl":
      shiftMultiValueTimes(item.c, offset)
      shiftScalarTimes(item.o, offset)
      return
    case "tm":
      shiftScalarTimes(item.s, offset)
      shiftScalarTimes(item.e, offset)
      shiftScalarTimes(item.o, offset)
      return
    case "tr":
      shiftMultiValueTimes(item.p, offset)
      shiftMultiValueTimes(item.a, offset)
      shiftMultiValueTimes(item.s, offset)
      shiftScalarTimes(item.r, offset)
      shiftScalarTimes(item.o, offset)
  }
}

function shiftGroupTimes(group: LottieGroup, offset: number): void {
  for (const item of group.it) shiftMarkItemTimes(item, offset)
}

function shiftFigureLayerTimes(layer: TLottieFigureLayer, offset: number): void {
  shiftScalarTimes(layer.ks.o, offset)
  shiftScalarTimes(layer.ks.r, offset)
  shiftMultiValueTimes(layer.ks.p, offset)
  shiftMultiValueTimes(layer.ks.a, offset)
  shiftMultiValueTimes(layer.ks.s, offset)
  for (const group of layer["shapes"]) shiftGroupTimes(group, offset)
}

/**
 * Concatenates compositions onto a single timeline. One player and one loop rather than a
 * React state machine swapping animation data — no re-initialisation hitch at a handover,
 * and each layer is inactive outside its own window via `ip`/`op`.
 */
function sequenceAnimations(input: {
  name: string
  segments: LottieAnimationData[]
  gap: number
}): LottieAnimationData {
  const layers: TLottieFigureLayer[] = []
  let offset = 0

  for (const segment of input.segments) {
    for (const layer of segment.layers) {
      shiftFigureLayerTimes(layer, offset)
      layer.ind = layers.length + 1
      layer.ip += offset
      layer.op += offset
      layer.st += offset
      layers.push(layer)
    }
    offset += segment.op + input.gap
  }

  return animation({ name: input.name, duration: offset, layers })
}

export type WhiteboardOpeningSelection = WhiteboardOpeningVariantID | "sequence"

/** What the whiteboard pane ships: every composition in turn, evenly spaced. */
export const WHITEBOARD_OPENING_DEFAULT_SELECTION = "sequence" satisfies WhiteboardOpeningSelection

export function buildWhiteboardOpening(selection: WhiteboardOpeningSelection) {
  if (selection !== "sequence") {
    const variant = whiteboardOpeningVariant(selection)
    return { data: variant.build(), restFrame: variant.restFrame }
  }
  return {
    data: sequenceAnimations({
      name: "Whiteboard opening sequence",
      segments: WHITEBOARD_OPENING_VARIANTS.map((variant) => variant.build()),
      gap: SEQUENCE_GAP_FRAMES,
    }),
    // The still frame stays inside the first composition, which starts at offset zero.
    restFrame: WHITEBOARD_OPENING_VARIANTS[0].restFrame,
  }
}
