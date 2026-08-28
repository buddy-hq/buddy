import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { MotionConfig, motion, useReducedMotion } from "motion/react"
import { Badge, cn } from "@buddy/ui"
import { ConwayGlider } from "@/components/chat/tools/conway-glider"

/*
 * Working-state canvas.
 *
 * Twenty-four loading states that move in two dimensions — orbits, paths,
 * fields, drops, sweeps — rather than sliding a shape left to right. Every
 * animation is authored in a 24×24 coordinate space and scaled to the requested
 * size, so they can be compared honestly at the size they'd actually ship at.
 *
 * Prototype surface. Nothing here is wired into the product yet.
 */

const ACCENT = "var(--icon-interactive-base)"
const ACCENT_CLASS = "bg-icon-interactive-base"

const STAGE = 24

type Beat = { speed: number; size: number }

function loop(duration: number, speed: number, ease: "easeInOut" | "linear" = "easeInOut") {
  return { duration: duration / speed, repeat: Infinity, ease }
}

/** Everything is drawn in a 24×24 box, then scaled to the display size. */
function Stage({ size, children }: { size: number; children: ReactNode }) {
  return (
    <span
      className="relative block shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 block"
        style={{
          width: STAGE,
          height: STAGE,
          transform: `scale(${size / STAGE})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </span>
    </span>
  )
}

function Dot({
  size = 5,
  className,
  style,
}: {
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={cn("absolute rounded-full", ACCENT_CLASS, className)}
      style={{ width: size, height: size, ...style }}
    />
  )
}

/** offset-path rider — the cleanest way to move something along a real 2D curve. */
function PathRider({
  path,
  duration,
  speed,
  delay = 0,
  dot = 5,
  opacity = 1,
  reverse = false,
}: {
  path: string
  duration: number
  speed: number
  delay?: number
  dot?: number
  opacity?: number
  reverse?: boolean
}) {
  return (
    <motion.span
      className={cn("absolute rounded-full", ACCENT_CLASS)}
      style={{
        width: dot,
        height: dot,
        offsetPath: `path("${path}")`,
        offsetRotate: "0deg",
        opacity,
      }}
      animate={{ offsetDistance: reverse ? ["100%", "0%"] : ["0%", "100%"] }}
      transition={{ duration: duration / speed, delay, repeat: Infinity, ease: "linear" }}
    />
  )
}

// ─── paths ───────────────────────────────────────────────────────────────────

const PATH_EIGHT = "M12 5 C 18 5 18 12 12 12 C 6 12 6 19 12 19 C 18 19 18 12 12 12 C 6 12 6 5 12 5"
const PATH_PRETZEL = "M12 4 C 21 8 3 16 12 20 C 21 16 3 8 12 4"
const PATH_SPIRAL =
  "M12 12 C 13.5 10.5 16 11 16 13 C 16 16 11 16.5 10 13 C 8.6 8.6 16 6.5 18.5 11 C 21 15.5 15 21.5 9 19"
const PATH_RING = "M12 3 A9 9 0 1 1 11.99 3"
const PATH_PERIMETER =
  "M7 3 H17 A4 4 0 0 1 21 7 V17 A4 4 0 0 1 17 21 H7 A4 4 0 0 1 3 17 V7 A4 4 0 0 1 7 3 Z"
const PATH_WEAVE_A = "M3 12 C 8 3 16 21 21 12"
const PATH_WEAVE_B = "M3 12 C 8 21 16 3 21 12"
const PATH_ZIGZAG = "M3 6 L9 18 L15 6 L21 18"

// ─── 1 · orbit ───────────────────────────────────────────────────────────────

function Orbit({ speed }: Beat) {
  return (
    <>
      <Dot size={4} style={{ left: 10, top: 10, opacity: 0.35 }} />
      <motion.span
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={loop(1.6, speed, "linear")}
      >
        <Dot size={5} style={{ left: 9.5, top: 1 }} />
      </motion.span>
    </>
  )
}

// ─── 2 · twin orbit ──────────────────────────────────────────────────────────

function TwinOrbit({ speed }: Beat) {
  return (
    <>
      <motion.span
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={loop(1.9, speed, "linear")}
      >
        <Dot size={5} style={{ left: 9.5, top: 0.5 }} />
      </motion.span>
      <motion.span
        className="absolute"
        style={{ inset: 6 }}
        animate={{ rotate: -360 }}
        transition={loop(1.2, speed, "linear")}
      >
        <Dot size={3.5} style={{ left: 4.25, top: 0 }} />
      </motion.span>
    </>
  )
}

// ─── 3 · figure eight ────────────────────────────────────────────────────────

function FigureEight({ speed }: Beat) {
  return <PathRider path={PATH_EIGHT} duration={2.4} speed={speed} />
}

// ─── 4 · pretzel ─────────────────────────────────────────────────────────────

function Pretzel({ speed }: Beat) {
  return (
    <>
      <PathRider path={PATH_PRETZEL} duration={2.8} speed={speed} />
      <PathRider
        path={PATH_PRETZEL}
        duration={2.8}
        speed={speed}
        delay={0.5}
        dot={3}
        opacity={0.4}
      />
    </>
  )
}

// ─── 5 · spiral ──────────────────────────────────────────────────────────────

function Spiral({ speed }: Beat) {
  return (
    <motion.span
      className="absolute inset-0"
      animate={{ rotate: 360 }}
      transition={loop(6, speed, "linear")}
    >
      <PathRider path={PATH_SPIRAL} duration={2.6} speed={speed} dot={4.5} />
    </motion.span>
  )
}

// ─── 6 · comet ───────────────────────────────────────────────────────────────

function Comet({ speed }: Beat) {
  return (
    <>
      <PathRider path={PATH_RING} duration={1.8} speed={speed} dot={5} />
      <PathRider path={PATH_RING} duration={1.8} speed={speed} delay={0.09} dot={4} opacity={0.5} />
      <PathRider
        path={PATH_RING}
        duration={1.8}
        speed={speed}
        delay={0.18}
        dot={3}
        opacity={0.28}
      />
      <PathRider
        path={PATH_RING}
        duration={1.8}
        speed={speed}
        delay={0.27}
        dot={2}
        opacity={0.14}
      />
    </>
  )
}

// ─── 7 · perimeter snake ─────────────────────────────────────────────────────

function PerimeterSnake({ speed }: Beat) {
  return (
    <>
      <PathRider path={PATH_PERIMETER} duration={2.6} speed={speed} dot={5} />
      <PathRider
        path={PATH_PERIMETER}
        duration={2.6}
        speed={speed}
        delay={0.14}
        dot={4}
        opacity={0.5}
      />
      <PathRider
        path={PATH_PERIMETER}
        duration={2.6}
        speed={speed}
        delay={0.28}
        dot={3}
        opacity={0.25}
      />
    </>
  )
}

// ─── 8 · weave ───────────────────────────────────────────────────────────────

function Weave({ speed }: Beat) {
  return (
    <>
      <PathRider path={PATH_WEAVE_A} duration={1.7} speed={speed} dot={5} />
      <PathRider path={PATH_WEAVE_B} duration={1.7} speed={speed} dot={5} opacity={0.55} />
    </>
  )
}

// ─── 9 · zigzag runner ───────────────────────────────────────────────────────

function Zigzag({ speed }: Beat) {
  return (
    <>
      <PathRider path={PATH_ZIGZAG} duration={1.5} speed={speed} dot={5} />
      <PathRider
        path={PATH_ZIGZAG}
        duration={1.5}
        speed={speed}
        delay={0.2}
        dot={3.5}
        opacity={0.35}
      />
    </>
  )
}

// ─── 10 · pendulum ───────────────────────────────────────────────────────────

function Pendulum({ speed }: Beat) {
  return (
    <motion.span
      className="absolute inset-0"
      style={{ transformOrigin: "12px 3px" }}
      animate={{ rotate: [-38, 38, -38] }}
      transition={loop(1.9, speed)}
    >
      <span
        className="absolute"
        style={{ left: 11.5, top: 3, width: 1, height: 11, background: ACCENT, opacity: 0.3 }}
      />
      <Dot size={6} style={{ left: 9, top: 13 }} />
    </motion.span>
  )
}

// ─── 11 · bounce ─────────────────────────────────────────────────────────────

function Bounce({ speed }: Beat) {
  return (
    <>
      <span
        className="absolute"
        style={{ left: 2, top: 20, width: 20, height: 1, background: ACCENT, opacity: 0.25 }}
      />
      <motion.span
        className="absolute"
        animate={{ x: [1, 17, 1] }}
        transition={loop(2.4, speed)}
        style={{ top: 0, left: 0 }}
      >
        <motion.span
          className={cn("block rounded-full", ACCENT_CLASS)}
          style={{ width: 6, height: 6 }}
          animate={{ y: [2, 14, 2], scaleY: [1, 0.65, 1], scaleX: [1, 1.3, 1] }}
          transition={{
            duration: 0.6 / speed,
            repeat: Infinity,
            ease: "easeIn",
            repeatType: "reverse",
          }}
        />
      </motion.span>
    </>
  )
}

// ─── 12 · diagonal shuttle ───────────────────────────────────────────────────

function Shuttle({ speed }: Beat) {
  return (
    <motion.span
      className="absolute"
      animate={{ x: [1, 17, 1] }}
      transition={loop(1.3, speed, "linear")}
      style={{ top: 0, left: 0 }}
    >
      <motion.span
        className={cn("block rounded-[2px]", ACCENT_CLASS)}
        style={{ width: 6, height: 6 }}
        animate={{ y: [1, 17, 1], rotate: [0, 90, 0] }}
        transition={loop(1.9, speed, "linear")}
      />
    </motion.span>
  )
}

// ─── 13 · wave field ─────────────────────────────────────────────────────────

const FIELD = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 1, y: 0 },
  { id: "c", x: 2, y: 0 },
  { id: "d", x: 0, y: 1 },
  { id: "e", x: 1, y: 1 },
  { id: "f", x: 2, y: 1 },
  { id: "g", x: 0, y: 2 },
  { id: "h", x: 1, y: 2 },
  { id: "i", x: 2, y: 2 },
]

function WaveField({ speed }: Beat) {
  return (
    <>
      {FIELD.map((cell) => (
        <motion.span
          key={cell.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{ width: 4, height: 4, left: 3 + cell.x * 7, top: 3 + cell.y * 7 }}
          animate={{ opacity: [0.15, 1, 0.15], scale: [0.7, 1.2, 0.7] }}
          transition={{
            duration: 1.5 / speed,
            delay: ((cell.x + cell.y) * 0.13) / speed,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  )
}

// ─── 14 · ripple field ───────────────────────────────────────────────────────

function RippleField({ speed }: Beat) {
  return (
    <>
      {FIELD.map((cell) => {
        const distance = Math.hypot(cell.x - 1, cell.y - 1)
        return (
          <motion.span
            key={cell.id}
            className={cn("absolute rounded-full", ACCENT_CLASS)}
            style={{ width: 4, height: 4, left: 3 + cell.x * 7, top: 3 + cell.y * 7 }}
            animate={{ scale: [0.5, 1.35, 0.5], opacity: [0.2, 1, 0.2] }}
            transition={{
              duration: 1.7 / speed,
              delay: (distance * 0.22) / speed,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )
      })}
    </>
  )
}

// ─── 15 · random walk ────────────────────────────────────────────────────────

const WALK = [
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 1 },
  { x: 2, y: 2 },
  { x: 1, y: 2 },
  { x: 1, y: 1 },
]

function RandomWalk({ speed }: Beat) {
  return (
    <>
      {FIELD.map((cell) => (
        <span
          key={cell.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{
            width: 3,
            height: 3,
            left: 3.5 + cell.x * 7,
            top: 3.5 + cell.y * 7,
            opacity: 0.18,
          }}
        />
      ))}
      <motion.span
        className={cn("absolute rounded-full", ACCENT_CLASS)}
        style={{ width: 6, height: 6, left: 0, top: 0 }}
        animate={{
          x: WALK.map((step) => 2 + step.x * 7),
          y: WALK.map((step) => 2 + step.y * 7),
        }}
        transition={{ duration: 3.2 / speed, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  )
}

// ─── 16 · crosshair scan ─────────────────────────────────────────────────────

function Crosshair({ speed }: Beat) {
  return (
    <>
      <motion.span
        className="absolute"
        style={{ left: 0, width: STAGE, height: 1, background: ACCENT, opacity: 0.45 }}
        animate={{ top: [3, 20, 3] }}
        transition={loop(2.1, speed)}
      />
      <motion.span
        className="absolute"
        style={{ top: 0, height: STAGE, width: 1, background: ACCENT, opacity: 0.45 }}
        animate={{ left: [4, 19, 4] }}
        transition={loop(1.4, speed)}
      />
      <motion.span
        className={cn("absolute rounded-full", ACCENT_CLASS)}
        style={{ width: 4, height: 4 }}
        animate={{ left: [2, 17, 2], top: [1, 18, 1] }}
        transition={{
          left: loop(1.4, speed),
          top: loop(2.1, speed),
        }}
      />
    </>
  )
}

// ─── 17 · radar ──────────────────────────────────────────────────────────────

function Radar({ speed }: Beat) {
  return (
    <>
      <span
        className="absolute rounded-full"
        style={{ inset: 1, border: `1px solid ${ACCENT}`, opacity: 0.25 }}
      />
      <motion.span
        className="absolute rounded-full"
        style={{
          inset: 1,
          background: `conic-gradient(from 0deg, ${ACCENT} 0deg, transparent 70deg)`,
          opacity: 0.75,
        }}
        animate={{ rotate: 360 }}
        transition={loop(1.7, speed, "linear")}
      />
    </>
  )
}

// ─── 18 · pulse rings ────────────────────────────────────────────────────────

const RING_DELAYS = [0, 0.45, 0.9]

function PulseRings({ speed }: Beat) {
  return (
    <>
      <Dot size={5} style={{ left: 9.5, top: 9.5 }} />
      {RING_DELAYS.map((delay) => (
        <motion.span
          key={delay}
          className="absolute rounded-full"
          style={{ inset: 8, border: `1px solid ${ACCENT}` }}
          animate={{ scale: [0.6, 3.4], opacity: [0.7, 0] }}
          transition={{
            duration: 1.8 / speed,
            delay: delay / speed,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  )
}

// ─── 19 · rainfall ───────────────────────────────────────────────────────────

const RAIN = [
  { id: "a", left: 4, delay: 0, duration: 1.1 },
  { id: "b", left: 11, delay: 0.36, duration: 1.4 },
  { id: "c", left: 18, delay: 0.72, duration: 1.2 },
]

function Rainfall({ speed }: Beat) {
  return (
    <>
      {RAIN.map((drop) => (
        <motion.span
          key={drop.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{ width: 3.5, height: 3.5, left: drop.left }}
          animate={{ y: [-2, 22], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: drop.duration / speed,
            delay: drop.delay / speed,
            repeat: Infinity,
            ease: "easeIn",
          }}
        />
      ))}
    </>
  )
}

// ─── 20 · stack drop ─────────────────────────────────────────────────────────

const STACK = [
  { id: "a", top: 17, delay: 0 },
  { id: "b", top: 11.5, delay: 0.55 },
  { id: "c", top: 6, delay: 1.1 },
]

function StackDrop({ speed }: Beat) {
  return (
    <>
      {STACK.map((block) => (
        <motion.span
          key={block.id}
          className={cn("absolute rounded-[1.5px]", ACCENT_CLASS)}
          style={{ width: 12, height: 4.5, left: 6, top: block.top }}
          animate={{ y: [-18, 0, 0, -18], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 2.4 / speed,
            delay: block.delay / speed,
            times: [0, 0.28, 0.85, 1],
            repeat: Infinity,
            ease: "easeIn",
          }}
        />
      ))}
    </>
  )
}

// ─── 21 · morph blob ─────────────────────────────────────────────────────────

function MorphBlob({ speed }: Beat) {
  return (
    <motion.span
      className={cn("absolute", ACCENT_CLASS)}
      style={{ inset: 5 }}
      animate={{
        borderRadius: ["30% 70% 70% 30%", "70% 30% 30% 70%", "50% 50% 50% 50%", "30% 70% 70% 30%"],
        rotate: [0, 120, 240, 360],
        scale: [1, 0.82, 1.05, 1],
      }}
      transition={loop(3.4, speed)}
    />
  )
}

// ─── 22 · petal bloom ────────────────────────────────────────────────────────

const PETALS = [0, 60, 120, 180, 240, 300]

function PetalBloom({ speed }: Beat) {
  return (
    <>
      {PETALS.map((angle, index) => (
        <motion.span
          key={angle}
          className="absolute"
          style={{ inset: 0, transform: `rotate(${angle}deg)` }}
          animate={{ opacity: [0.15, 1, 0.15] }}
          transition={{
            duration: 1.6 / speed,
            delay: (index * 0.13) / speed,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <span
            className={ACCENT_CLASS}
            style={{
              position: "absolute",
              left: 10.5,
              top: 1.5,
              width: 3,
              height: 7,
              borderRadius: 3,
            }}
          />
        </motion.span>
      ))}
    </>
  )
}

// ─── 23 · flip tiles ─────────────────────────────────────────────────────────

const TILES = [
  { id: "a", left: 3, top: 3, delay: 0 },
  { id: "b", left: 13, top: 3, delay: 0.18 },
  { id: "c", left: 13, top: 13, delay: 0.36 },
  { id: "d", left: 3, top: 13, delay: 0.54 },
]

function FlipTiles({ speed }: Beat) {
  return (
    <>
      {TILES.map((tile) => (
        <motion.span
          key={tile.id}
          className={cn("absolute rounded-[2px]", ACCENT_CLASS)}
          style={{ width: 8, height: 8, left: tile.left, top: tile.top }}
          animate={{ rotateY: [0, 180, 180, 0], opacity: [1, 0.35, 0.35, 1] }}
          transition={{
            duration: 2.2 / speed,
            delay: tile.delay / speed,
            times: [0, 0.3, 0.7, 1],
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  )
}

// ─── 24 · constellation drift ────────────────────────────────────────────────

const DRIFTERS = [
  { id: "a", x: [3, 14, 7, 3], y: [5, 3, 15, 5], size: 4, duration: 5.2 },
  { id: "b", x: [16, 6, 18, 16], y: [16, 12, 4, 16], size: 3, duration: 6.4 },
  { id: "c", x: [10, 18, 12, 10], y: [18, 8, 19, 18], size: 5, duration: 4.6 },
  { id: "d", x: [6, 12, 3, 6], y: [10, 18, 8, 10], size: 2.5, duration: 7.1 },
]

function Constellation({ speed }: Beat) {
  return (
    <>
      {DRIFTERS.map((drifter) => (
        <motion.span
          key={drifter.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{ width: drifter.size, height: drifter.size, left: 0, top: 0 }}
          animate={{ x: drifter.x, y: drifter.y, opacity: [0.45, 1, 0.6, 0.45] }}
          transition={loop(drifter.duration, speed)}
        />
      ))}
    </>
  )
}

// ─── 25 · jitter cloud ───────────────────────────────────────────────────────

const JITTER = [
  { id: "a", left: 6, top: 6, dx: [0, 2, -1.5, 0], dy: [0, -1.5, 2, 0], duration: 1.1 },
  { id: "b", left: 14, top: 7, dx: [0, -2, 1, 0], dy: [0, 2, -1, 0], duration: 0.9 },
  { id: "c", left: 9, top: 13, dx: [0, 1.5, 2, 0], dy: [0, 1.5, -2, 0], duration: 1.3 },
  { id: "d", left: 15, top: 14, dx: [0, -1, -2, 0], dy: [0, -2, 1.5, 0], duration: 1.05 },
]

function JitterCloud({ speed }: Beat) {
  return (
    <>
      {JITTER.map((particle) => (
        <motion.span
          key={particle.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{ width: 4, height: 4, left: particle.left, top: particle.top }}
          animate={{ x: particle.dx, y: particle.dy }}
          transition={loop(particle.duration, speed)}
        />
      ))}
    </>
  )
}

// ─── 26 · elastic thread ─────────────────────────────────────────────────────

function ElasticThread({ speed }: Beat) {
  return (
    <>
      <Dot size={4} style={{ left: 2, top: 10, opacity: 0.5 }} />
      <motion.span
        className="absolute"
        style={{
          left: 4,
          top: 11.5,
          height: 1,
          background: ACCENT,
          transformOrigin: "left center",
        }}
        animate={{ rotate: [-32, 32, -32], scaleX: [1, 1.35, 1], width: [16, 16, 16] }}
        transition={loop(2, speed)}
      />
      <motion.span
        className="absolute"
        style={{ left: 0, top: 0 }}
        animate={{ x: [15, 17, 15], y: [3, 18, 3] }}
        transition={loop(2, speed)}
      >
        <span className={cn("block rounded-full", ACCENT_CLASS)} style={{ width: 6, height: 6 }} />
      </motion.span>
    </>
  )
}

// ─── 27 · counter gears ──────────────────────────────────────────────────────

function CounterGears({ speed }: Beat) {
  return (
    <>
      <motion.span
        className="absolute rounded-full"
        style={{
          inset: 1,
          border: `2px dashed ${ACCENT}`,
          opacity: 0.65,
        }}
        animate={{ rotate: 360 }}
        transition={loop(3, speed, "linear")}
      />
      <motion.span
        className="absolute rounded-full"
        style={{
          inset: 7,
          border: `2px dotted ${ACCENT}`,
        }}
        animate={{ rotate: -360 }}
        transition={loop(1.8, speed, "linear")}
      />
    </>
  )
}

// ─── 28 · magnet swarm ───────────────────────────────────────────────────────

const SWARM = [0, 120, 240]

function MagnetSwarm({ speed }: Beat) {
  return (
    <motion.span
      className="absolute inset-0"
      animate={{ x: [-3, 3, -3], y: [2, -2, 2] }}
      transition={loop(3.6, speed)}
    >
      {SWARM.map((angle, index) => (
        <motion.span
          key={angle}
          className="absolute inset-0"
          style={{ rotate: angle }}
          animate={{ rotate: [angle, angle + 360] }}
          transition={loop(2 + index * 0.35, speed, "linear")}
        >
          <span
            className={cn("absolute rounded-full", ACCENT_CLASS)}
            style={{ width: 4.5, height: 4.5, left: 9.75, top: 3 - index }}
          />
        </motion.span>
      ))}
    </motion.span>
  )
}

// ═══ mathematics ═════════════════════════════════════════════════════════════
/*
 * Everything below is driven by a real equation rather than hand-picked
 * keyframes. Each generator is evaluated once at module load into keyframe
 * arrays, so the animation is deterministic and costs nothing at render time.
 */

const TAU = Math.PI * 2
const PHI = 1.618033988749895

/** Samples a parametric function into a seamless keyframe loop (t = 0…1). */
function cycle<T>(steps: number, fn: (t: number) => T): T[] {
  const out: T[] = []
  for (let index = 0; index <= steps; index += 1) out.push(fn(index / steps))
  return out
}

/** Escape-time iteration count for z² + c. Drives the Mandelbrot/Julia cascades. */
function escapeTime(cr: number, ci: number, zr0: number, zi0: number, max: number): number {
  let zr = zr0
  let zi = zi0
  for (let index = 0; index < max; index += 1) {
    const nextR = zr * zr - zi * zi + cr
    const nextI = 2 * zr * zi + ci
    zr = nextR
    zi = nextI
    if (zr * zr + zi * zi > 4) return index
  }
  return max
}

type FieldCell = { id: string; x: number; y: number; values: number[]; delay?: number }

const CASCADE_PULSE = [0.08, 1, 0.08]
const ESCAPE_MAX = 18

/** Grid delays taken from the Mandelbrot set — organic bands, zero randomness. */
function mandelbrotCells(n: number, spread: number): FieldCell[] {
  const cells: FieldCell[] = []
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const cr = -2.1 + (x / (n - 1)) * 2.8
      const ci = -1.25 + (y / (n - 1)) * 2.5
      const escaped = escapeTime(cr, ci, 0, 0, ESCAPE_MAX)
      cells.push({
        id: `m${x}-${y}`,
        x,
        y,
        values: CASCADE_PULSE,
        delay: (escaped / ESCAPE_MAX) * spread,
      })
    }
  }
  return cells
}

/** Same machinery, Julia set for c = −0.4 + 0.6i — a completely different figure. */
function juliaCells(n: number, spread: number): FieldCell[] {
  const cells: FieldCell[] = []
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const zr = -1.7 + (x / (n - 1)) * 3.4
      const zi = -1.7 + (y / (n - 1)) * 3.4
      const escaped = escapeTime(-0.4, 0.6, zr, zi, ESCAPE_MAX)
      cells.push({
        id: `j${x}-${y}`,
        x,
        y,
        values: CASCADE_PULSE,
        delay: (escaped / ESCAPE_MAX) * spread,
      })
    }
  }
  return cells
}

/** Rule 90 — successive generations of the 1D automaton stack into Sierpiński. */
function rule90Cells(n: number): FieldCell[] {
  const rows: number[][] = [Array.from({ length: n }, (_, i) => (i === (n - 1) / 2 ? 1 : 0))]
  for (let generation = 1; generation < n; generation += 1) {
    const previous = rows[generation - 1]
    rows.push(previous.map((_, i) => (previous[i - 1] ?? 0) ^ (previous[i + 1] ?? 0)))
  }

  const cells: FieldCell[] = []
  rows.forEach((row, y) => {
    row.forEach((alive, x) => {
      cells.push({
        id: `r${x}-${y}`,
        x,
        y,
        values: alive ? [0.06, 1, 0.06] : [0.06, 0.1, 0.06],
        delay: y * 0.11,
      })
    })
  })
  return cells
}

/** Classic plasma: three interfering sine gratings sampled over the loop. */
function plasmaCells(n: number, samples: number): FieldCell[] {
  const cells: FieldCell[] = []
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      cells.push({
        id: `p${x}-${y}`,
        x,
        y,
        values: cycle(samples, (t) => {
          const a = Math.sin(x * 0.9 + t * TAU)
          const b = Math.sin(y * 1.3 + t * TAU * 1.1)
          const c = Math.sin((x + y) * 0.7 + t * TAU * 0.8)
          return 0.1 + ((a + b + c) / 3 + 1) * 0.45
        }),
      })
    }
  }
  return cells
}

/** Chladni nodal figure: |sin(nπu)sin(mπv) − sin(mπu)sin(nπv)|, with m sweeping. */
function chladniCells(n: number, samples: number): FieldCell[] {
  const cells: FieldCell[] = []
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const u = x / (n - 1)
      const v = y / (n - 1)
      cells.push({
        id: `c${x}-${y}`,
        x,
        y,
        values: cycle(samples, (t) => {
          const wave = 2 + Math.sin(t * TAU) * 1.5
          const modes = 4
          const amplitude = Math.abs(
            Math.sin(modes * Math.PI * u) * Math.sin(wave * Math.PI * v) -
              Math.sin(wave * Math.PI * u) * Math.sin(modes * Math.PI * v),
          )
          return 0.08 + Math.min(amplitude, 1) * 0.92
        }),
      })
    }
  }
  return cells
}

/** Lorenz attractor, integrated then projected onto x–z. */
function lorenzTrack(samples: number) {
  let x = 0.9
  let y = 1.2
  let z = 22
  const dt = 0.006
  const points: [number, number][] = []
  for (let step = 0; step < samples * 14; step += 1) {
    const dx = 10 * (y - x)
    const dy = x * (28 - z) - y
    const dz = x * y - (8 / 3) * z
    x += dx * dt
    y += dy * dt
    z += dz * dt
    if (step % 14 === 0) points.push([x, z])
  }
  const xs = points.map(([px]) => 12 + px * 0.55)
  const ys = points.map(([, pz]) => pz * 0.42 - 8)
  return { xs: [...xs, xs[0]], ys: [...ys, ys[0]] }
}

/** Logistic map at r = 3.9 — deterministic chaos, never visibly repeating. */
function logisticSeries(count: number, seed: number): number[] {
  const out: number[] = []
  let value = seed
  for (let index = 0; index < count; index += 1) {
    value = 3.9 * value * (1 - value)
    out.push(value)
  }
  out.push(out[0])
  return out
}

/** Curl-ish flow field: u = sin(ky), v = cos(kx). */
function flowTrack(seedX: number, seedY: number, samples: number) {
  let x = seedX
  let y = seedY
  const xs: number[] = []
  const ys: number[] = []
  for (let step = 0; step < samples; step += 1) {
    const u = Math.sin(y * 0.42)
    const v = Math.cos(x * 0.42)
    x = (x + u * 0.9 + 24) % 24
    y = (y + v * 0.9 + 24) % 24
    xs.push(x)
    ys.push(y)
  }
  return { xs, ys }
}

/** Gielis superformula — one equation, an entire zoo of organic outlines. */
function superformulaPolygon(
  points: number,
  m: number,
  n1: number,
  n2: number,
  n3: number,
): string {
  const coords: string[] = []
  let maxR = 0
  const radii: number[] = []
  for (let index = 0; index < points; index += 1) {
    const theta = (index / points) * TAU
    const t1 = Math.abs(Math.cos((m * theta) / 4)) ** n2
    const t2 = Math.abs(Math.sin((m * theta) / 4)) ** n3
    const r = (t1 + t2) ** (-1 / n1)
    radii.push(r)
    if (Number.isFinite(r) && r > maxR) maxR = r
  }
  radii.forEach((r, index) => {
    const theta = (index / points) * TAU
    const scaled = Number.isFinite(r) ? (r / maxR) * 50 : 50
    coords.push(
      `${(50 + Math.cos(theta) * scaled).toFixed(2)}% ${(50 + Math.sin(theta) * scaled).toFixed(2)}%`,
    )
  })
  return `polygon(${coords.join(", ")})`
}

/** Rose curve r = |cos(kθ)|. */
function rosePolygon(points: number, k: number): string {
  const coords: string[] = []
  for (let index = 0; index < points; index += 1) {
    const theta = (index / points) * TAU
    const r = Math.abs(Math.cos(k * theta)) * 0.82 + 0.18
    coords.push(
      `${(50 + Math.cos(theta) * r * 50).toFixed(2)}% ${(50 + Math.sin(theta) * r * 50).toFixed(2)}%`,
    )
  }
  return `polygon(${coords.join(", ")})`
}

/** Eight radii from golden-ratio-detuned sines — wobbles without ever repeating. */
function goldenRadius(t: number): string {
  const parts: number[] = []
  for (let index = 0; index < 8; index += 1) {
    parts.push(46 + 20 * Math.sin(TAU * (t * (1 + (index % 3) * 0.11) + index * PHI)))
  }
  return `${parts[0]}% ${parts[1]}% ${parts[2]}% ${parts[3]}% / ${parts[4]}% ${parts[5]}% ${parts[6]}% ${parts[7]}%`
}

// ─── shared renderers for the generated sets ─────────────────────────────────

function CellGrid({
  n,
  cells,
  duration,
  speed,
  round,
  fill = 0.76,
}: {
  n: number
  cells: FieldCell[]
  duration: number
  speed: number
  round: boolean
  fill?: number
}) {
  const spacing = STAGE / n
  const box = spacing * fill
  const offset = (spacing - box) / 2

  return (
    <>
      {cells.map((cell) => (
        <motion.span
          key={cell.id}
          className={cn("absolute", ACCENT_CLASS)}
          style={{
            width: box,
            height: box,
            borderRadius: round ? 999 : Math.max(0.8, box * 0.22),
            left: cell.x * spacing + offset,
            top: cell.y * spacing + offset,
          }}
          animate={{
            opacity: cell.values,
            scale: cell.values.map((value) => 0.5 + value * 0.5),
          }}
          transition={{
            duration: duration / speed,
            delay: (cell.delay ?? 0) / speed,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  )
}

function Traveler({
  xs,
  ys,
  duration,
  speed,
  delay = 0,
  size = 4,
  opacity = 1,
}: {
  xs: number[]
  ys: number[]
  duration: number
  speed: number
  delay?: number
  size?: number
  opacity?: number
}) {
  return (
    <motion.span
      className={cn("absolute rounded-full", ACCENT_CLASS)}
      style={{ width: size, height: size, left: 0, top: 0, opacity }}
      animate={{ x: xs, y: ys }}
      transition={{ duration: duration / speed, delay, repeat: Infinity, ease: "linear" }}
    />
  )
}

function ClipMorph({
  frames,
  duration,
  speed,
  spin = 0,
}: {
  frames: string[]
  duration: number
  speed: number
  spin?: number
}) {
  return (
    <motion.span
      className={cn("absolute", ACCENT_CLASS)}
      style={{ inset: 2 }}
      animate={{ clipPath: frames, rotate: spin ? [0, spin] : undefined }}
      transition={{ duration: duration / speed, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

// ─── new fields ──────────────────────────────────────────────────────────────

const CHLADNI_CELLS = chladniCells(7, 10)
const PLASMA_CELLS = plasmaCells(6, 12)
const LORENZ_TRACK = lorenzTrack(60)
const LOGISTIC_ROWS = [0.21, 0.47, 0.68, 0.83].map((seed) => logisticSeries(18, seed))
const FLOW_TRACKS = [
  flowTrack(4, 6, 34),
  flowTrack(15, 3, 34),
  flowTrack(9, 18, 34),
  flowTrack(20, 13, 34),
]
const MOIRE_DOTS = Array.from({ length: 25 }, (_, index) => ({
  id: `moire-${index}`,
  x: index % 5,
  y: Math.floor(index / 5),
}))

function ChladniField({ speed }: Beat) {
  return <CellGrid n={7} cells={CHLADNI_CELLS} duration={5} speed={speed} round />
}

function PlasmaField({ speed }: Beat) {
  return <CellGrid n={6} cells={PLASMA_CELLS} duration={4} speed={speed} round />
}

function LorenzField({ speed }: Beat) {
  return (
    <>
      <Traveler {...LORENZ_TRACK} duration={7} speed={speed} size={4.5} />
      <Traveler {...LORENZ_TRACK} duration={7} speed={speed} delay={0.5} size={3} opacity={0.45} />
      <Traveler {...LORENZ_TRACK} duration={7} speed={speed} delay={1} size={2} opacity={0.22} />
    </>
  )
}

function LogisticField({ speed }: Beat) {
  return (
    <>
      {LOGISTIC_ROWS.map((series, index) => (
        <motion.span
          key={series[0]}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{ width: 4, height: 4, left: 2.5 + index * 6, top: 0 }}
          animate={{ y: series.map((value) => 1 + value * 18) }}
          transition={{ duration: 4.5 / speed, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </>
  )
}

function FlowField({ speed }: Beat) {
  return (
    <>
      {FLOW_TRACKS.map((track, index) => (
        <Traveler
          key={track.xs[0]}
          xs={track.xs}
          ys={track.ys}
          duration={6 + index * 0.4}
          speed={speed}
          size={3.5}
          opacity={0.9 - index * 0.15}
        />
      ))}
    </>
  )
}

function MoireField({ speed }: Beat) {
  return (
    <>
      {MOIRE_DOTS.map((dot) => (
        <span
          key={dot.id}
          className={cn("absolute rounded-full", ACCENT_CLASS)}
          style={{
            width: 2.4,
            height: 2.4,
            left: 1.5 + dot.x * 5.3,
            top: 1.5 + dot.y * 5.3,
            opacity: 0.5,
          }}
        />
      ))}
      <motion.span
        className="absolute inset-0"
        animate={{ rotate: 360, scale: [1, 1.12, 1] }}
        transition={loop(9, speed, "linear")}
      >
        {MOIRE_DOTS.map((dot) => (
          <span
            key={dot.id}
            className={cn("absolute rounded-full", ACCENT_CLASS)}
            style={{
              width: 2.4,
              height: 2.4,
              left: 1.5 + dot.x * 5.3,
              top: 1.5 + dot.y * 5.3,
              opacity: 0.6,
            }}
          />
        ))}
      </motion.span>
    </>
  )
}

// ─── new blobs ───────────────────────────────────────────────────────────────

const SUPER_FRAMES = cycle(7, (t) =>
  superformulaPolygon(64, 3 + Math.sin(t * TAU) * 2, 0.6 + t * 0.3, 1.4, 1.4),
)
const STAR_FRAMES = cycle(6, (t) =>
  superformulaPolygon(64, 6, 0.3 + Math.sin(t * TAU) * 0.15, 0.6, 1.2),
)
const ROSE_FRAMES = cycle(6, (t) => rosePolygon(72, 2 + Math.sin(t * TAU) * 1.4))
const GOLDEN_FRAMES = cycle(12, (t) => goldenRadius(t))

function SuperBlob({ speed }: Beat) {
  return <ClipMorph frames={SUPER_FRAMES} duration={5.5} speed={speed} spin={120} />
}

function StarBlob({ speed }: Beat) {
  return <ClipMorph frames={STAR_FRAMES} duration={4.2} speed={speed} spin={-180} />
}

function RoseBlob({ speed }: Beat) {
  return <ClipMorph frames={ROSE_FRAMES} duration={5} speed={speed} spin={90} />
}

function GoldenBlob({ speed }: Beat) {
  return (
    <motion.span
      className={cn("absolute", ACCENT_CLASS)}
      style={{ inset: 4 }}
      animate={{ borderRadius: GOLDEN_FRAMES, rotate: [0, 360] }}
      transition={{ duration: 7 / speed, repeat: Infinity, ease: "linear" }}
    />
  )
}

/** Two blobs under a blur + contrast stack — they genuinely fuse and split. */
function MetaBlob({ speed }: Beat) {
  return (
    <span className="absolute inset-0" style={{ filter: "blur(2px) contrast(18)" }}>
      <motion.span
        className={cn("absolute rounded-full", ACCENT_CLASS)}
        style={{ width: 9, height: 9, left: 0, top: 7.5 }}
        animate={{ x: [1, 13, 1], scale: [1, 0.78, 1] }}
        transition={loop(2.6, speed)}
      />
      <motion.span
        className={cn("absolute rounded-full", ACCENT_CLASS)}
        style={{ width: 7, height: 7, left: 0, top: 8.5 }}
        animate={{ x: [15, 4, 15], y: [0, 3, 0] }}
        transition={loop(2.6, speed)}
      />
    </span>
  )
}

function PinchBlob({ speed }: Beat) {
  return (
    <motion.span
      className={cn("absolute", ACCENT_CLASS)}
      style={{ inset: 5, borderRadius: 999 }}
      animate={{
        scaleY: [1, 1.55, 0.72, 1],
        scaleX: [1, 0.66, 1.35, 1],
        borderRadius: ["50%", "46% 46% 50% 50%", "58%", "50%"],
        y: [0, -3, 2.5, 0],
      }}
      transition={loop(2.4, speed)}
    />
  )
}

// ─── new tiles ───────────────────────────────────────────────────────────────

const MANDELBROT_CELLS = mandelbrotCells(7, 1.3)
const JULIA_CELLS = juliaCells(7, 1.3)
const RULE90_CELLS = rule90Cells(7)
const SIERPINSKI_CELLS: FieldCell[] = Array.from({ length: 64 }, (_, index) => {
  const x = index % 8
  const y = Math.floor(index / 8)
  const filled = (x & y) === 0
  return {
    id: `s${x}-${y}`,
    x,
    y,
    values: filled ? [0.05, 1, 0.05] : [0.05, 0.08, 0.05],
    delay: (x + y) * 0.075,
  }
})

function MandelbrotTiles({ speed }: Beat) {
  return (
    <CellGrid
      n={7}
      cells={MANDELBROT_CELLS}
      duration={2.2}
      speed={speed}
      round={false}
      fill={0.82}
    />
  )
}

function JuliaTiles({ speed }: Beat) {
  return (
    <CellGrid n={7} cells={JULIA_CELLS} duration={2.2} speed={speed} round={false} fill={0.82} />
  )
}

function Rule90Tiles({ speed }: Beat) {
  return (
    <CellGrid n={7} cells={RULE90_CELLS} duration={1.9} speed={speed} round={false} fill={0.82} />
  )
}

/** The shipping indicator itself, so the canvas and the subagent card never drift. */
function LifeTiles() {
  return <ConwayGlider seed="canvas" className="absolute inset-0 text-icon-interactive-base" />
}

function SierpinskiTiles({ speed }: Beat) {
  return (
    <CellGrid n={8} cells={SIERPINSKI_CELLS} duration={2} speed={speed} round={false} fill={0.84} />
  )
}

// ═══ live systems ════════════════════════════════════════════════════════════
/*
 * Everything above is a keyframe loop: honest motion, but it comes back around
 * every few seconds. These are different — the system is integrated per frame
 * on a canvas, so the picture at t=40s has never been drawn before and won't be
 * drawn again. Two ways of getting there:
 *
 *   · Escape-time fractals rendered properly, with a continuous zoom. You can
 *     actually see the set, and you can see it repeating itself at every depth,
 *     which is the whole point of self-similarity.
 *   · Strange attractors and chaotic maps integrated live. Deterministic, but
 *     with sensitive dependence on initial conditions and irrationally detuned
 *     parameter drift, so the trajectory never closes.
 */

const MAX_CANVAS_PIXELS = 48

type PaintState = { time: number; dt: number; rgb: [number, number, number] }
type Painter = (ctx: CanvasRenderingContext2D, size: number, state: PaintState) => void
type PainterFactory = () => Painter

/** Resolve the accent token to raw RGB so pixels can be written directly. */
function readAccent(ctx: CanvasRenderingContext2D, css: string): [number, number, number] {
  ctx.save()
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const data = ctx.getImageData(0, 0, 1, 1).data
  ctx.restore()
  ctx.clearRect(0, 0, 1, 1)
  return [data[0], data[1], data[2]]
}

/** Pull alpha out of the whole canvas — trails decay without a background fill. */
function decay(ctx: CanvasRenderingContext2D, size: number, amount: number) {
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  ctx.fillStyle = `rgba(0,0,0,${amount})`
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = "source-over"
}

function LiveCanvas({
  size,
  speed,
  factory,
}: {
  size: number
  speed: number
  factory: PainterFactory
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const still = useReducedMotion() === true

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    const ratio = window.devicePixelRatio || 1
    const pixels = Math.min(MAX_CANVAS_PIXELS, Math.max(18, Math.round(size * ratio)))
    canvas.width = pixels
    canvas.height = pixels

    const css = getComputedStyle(canvas).getPropertyValue("--icon-interactive-base").trim()
    const rgb = readAccent(ctx, css || "#8f8cf5")
    ctx.clearRect(0, 0, pixels, pixels)

    const paint = factory()
    let time = 0

    if (still) {
      paint(ctx, pixels, { time: 0, dt: 1 / 60, rgb })
      return
    }

    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05) * speed
      last = now
      time += delta
      paint(ctx, pixels, { time, dt: delta, rgb })
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [size, speed, factory, still])

  return (
    <canvas
      ref={canvasRef}
      className="absolute left-0 top-0"
      style={{ width: STAGE, height: STAGE }}
      aria-hidden="true"
    />
  )
}

// ─── escape-time fractals, rendered as fractals ──────────────────────────────

type EscapeView = {
  centerX: number
  centerY: number
  scale: number
  maxIter: number
  julia?: { cr: number; ci: number }
  burning?: boolean
}

function paintEscape(
  ctx: CanvasRenderingContext2D,
  size: number,
  rgb: [number, number, number],
  view: EscapeView,
  buffer: ImageData,
) {
  const data = buffer.data
  for (let py = 0; py < size; py += 1) {
    const imaginary = view.centerY + (py / size - 0.5) * view.scale
    for (let px = 0; px < size; px += 1) {
      const real = view.centerX + (px / size - 0.5) * view.scale
      const cr = view.julia ? view.julia.cr : real
      const ci = view.julia ? view.julia.ci : imaginary
      let zr = view.julia ? real : 0
      let zi = view.julia ? imaginary : 0

      let iteration = 0
      while (iteration < view.maxIter) {
        const a = view.burning ? Math.abs(zr) : zr
        const b = view.burning ? Math.abs(zi) : zi
        const nextR = a * a - b * b + cr
        const nextI = 2 * a * b + ci
        zr = nextR
        zi = nextI
        if (zr * zr + zi * zi > 4) break
        iteration += 1
      }

      const inside = iteration >= view.maxIter
      const index = (py * size + px) * 4
      data[index] = rgb[0]
      data[index + 1] = rgb[1]
      data[index + 2] = rgb[2]
      data[index + 3] = inside ? 255 : Math.round(Math.sqrt(iteration / view.maxIter) * 235)
    }
  }
  ctx.putImageData(buffer, 0, 0)
}

/** A buffer per painter instance, resized on the first frame. */
function escapeBuffer() {
  let buffer: ImageData | undefined
  return (ctx: CanvasRenderingContext2D, size: number) => {
    if (!buffer || buffer.width !== size) buffer = ctx.createImageData(size, size)
    return buffer
  }
}

/** Triangle-wave depth: zooms in for ~43s, back out for ~43s. Seamless, no jump. */
function zoomDepth(time: number, rate: number, maxDepth: number) {
  const span = (time * rate) % (maxDepth * 2)
  return span < maxDepth ? span : maxDepth * 2 - span
}

/** Seahorse valley — the canonical point where self-similarity is unmissable. */
const SEAHORSE = { x: -0.743643887037159, y: 0.131825904205312 }
const SHIP = { x: -1.7549, y: -0.0285 }

const mandelbrotZoom: PainterFactory = () => {
  const bufferFor = escapeBuffer()
  return (ctx, size, state) => {
    const depth = zoomDepth(state.time, 0.28, 12)
    const scale = 3.4 * Math.exp(-depth)
    paintEscape(
      ctx,
      size,
      state.rgb,
      {
        centerX: SEAHORSE.x,
        centerY: SEAHORSE.y,
        scale,
        maxIter: Math.min(180, Math.round(48 + depth * 11)),
      },
      bufferFor(ctx, size),
    )
  }
}

const burningShipZoom: PainterFactory = () => {
  const bufferFor = escapeBuffer()
  return (ctx, size, state) => {
    const depth = zoomDepth(state.time, 0.24, 9)
    const scale = 3.2 * Math.exp(-depth)
    paintEscape(
      ctx,
      size,
      state.rgb,
      {
        centerX: SHIP.x,
        centerY: SHIP.y,
        scale,
        maxIter: Math.min(160, Math.round(46 + depth * 12)),
        burning: true,
      },
      bufferFor(ctx, size),
    )
  }
}

const juliaMorph: PainterFactory = () => {
  const bufferFor = escapeBuffer()
  return (ctx, size, state) => {
    // Two incommensurate rates — the parameter path never closes on itself.
    const angle = state.time * 0.21
    const radius = 0.7 + 0.09 * Math.sin(state.time * 0.0917)
    paintEscape(
      ctx,
      size,
      state.rgb,
      {
        centerX: 0,
        centerY: 0,
        scale: 3.2,
        maxIter: 64,
        julia: { cr: radius * Math.cos(angle), ci: radius * Math.sin(angle) },
      },
      bufferFor(ctx, size),
    )
  }
}

// ─── strange attractors, integrated live ─────────────────────────────────────

function plotter(ctx: CanvasRenderingContext2D, rgb: [number, number, number]) {
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

const lorenzLive: PainterFactory = () => {
  let x = 0.9
  let y = 1.2
  let z = 22
  return (ctx, size, state) => {
    decay(ctx, size, 0.055)
    plotter(ctx, state.rgb)
    const steps = Math.max(1, Math.round(state.dt * 900))
    for (let step = 0; step < steps; step += 1) {
      const dx = 10 * (y - x)
      const dy = x * (28 - z) - y
      const dz = x * y - (8 / 3) * z
      x += dx * 0.0022
      y += dy * 0.0022
      z += dz * 0.0022
      ctx.globalAlpha = 0.75
      ctx.fillRect((x * 0.022 + 0.5) * size, (z - 5) * 0.022 * size, 1.4, 1.4)
    }
    ctx.globalAlpha = 1
  }
}

const rosslerLive: PainterFactory = () => {
  let x = 1
  let y = 1
  let z = 1
  return (ctx, size, state) => {
    decay(ctx, size, 0.05)
    plotter(ctx, state.rgb)
    const steps = Math.max(1, Math.round(state.dt * 700))
    for (let step = 0; step < steps; step += 1) {
      const dx = -y - z
      const dy = x + 0.2 * y
      const dz = 0.2 + z * (x - 5.7)
      x += dx * 0.012
      y += dy * 0.012
      z += dz * 0.012
      ctx.globalAlpha = 0.7
      ctx.fillRect((x * 0.038 + 0.5) * size, (y * 0.038 + 0.5) * size, 1.4, 1.4)
    }
    ctx.globalAlpha = 1
  }
}

const thomasLive: PainterFactory = () => {
  let x = 1.1
  let y = 1.1
  let z = -0.01
  return (ctx, size, state) => {
    decay(ctx, size, 0.03)
    plotter(ctx, state.rgb)
    const steps = Math.max(1, Math.round(state.dt * 500))
    for (let step = 0; step < steps; step += 1) {
      const dx = Math.sin(y) - 0.208 * x
      const dy = Math.sin(z) - 0.208 * y
      const dz = Math.sin(x) - 0.208 * z
      x += dx * 0.06
      y += dy * 0.06
      z += dz * 0.06
      ctx.globalAlpha = 0.75
      ctx.fillRect((x * 0.1 + 0.5) * size, (y * 0.1 + 0.5) * size, 1.4, 1.4)
    }
    ctx.globalAlpha = 1
  }
}

/** Clifford — parameters drift on detuned sines, so the figure keeps reforming. */
const cliffordDrift: PainterFactory = () => {
  let x = 0.1
  let y = 0.1
  return (ctx, size, state) => {
    decay(ctx, size, 0.04)
    plotter(ctx, state.rgb)
    const a = -1.4 + 0.25 * Math.sin(state.time * 0.061)
    const b = 1.6 + 0.25 * Math.sin(state.time * 0.043 * PHI)
    const steps = Math.max(1, Math.round(state.dt * 900))
    for (let step = 0; step < steps; step += 1) {
      const nextX = Math.sin(a * y) + 1.0 * Math.cos(a * x)
      const nextY = Math.sin(b * x) + 0.7 * Math.cos(b * y)
      x = nextX
      y = nextY
      ctx.globalAlpha = 0.5
      ctx.fillRect((x * 0.2 + 0.5) * size, (y * 0.2 + 0.5) * size, 1.2, 1.2)
    }
    ctx.globalAlpha = 1
  }
}

const deJongDrift: PainterFactory = () => {
  let x = 0.5
  let y = 0.5
  return (ctx, size, state) => {
    decay(ctx, size, 0.04)
    plotter(ctx, state.rgb)
    const a = -2 + 0.4 * Math.sin(state.time * 0.052)
    const d = 2 + 0.4 * Math.sin(state.time * 0.037 * PHI)
    const steps = Math.max(1, Math.round(state.dt * 900))
    for (let step = 0; step < steps; step += 1) {
      const nextX = Math.sin(a * y) - Math.cos(-2 * x)
      const nextY = Math.sin(-1.2 * x) - Math.cos(d * y)
      x = nextX
      y = nextY
      ctx.globalAlpha = 0.5
      ctx.fillRect((x * 0.21 + 0.5) * size, (y * 0.21 + 0.5) * size, 1.2, 1.2)
    }
    ctx.globalAlpha = 1
  }
}

const henonSpray: PainterFactory = () => {
  let x = 0.1
  let y = 0.3
  return (ctx, size, state) => {
    decay(ctx, size, 0.05)
    plotter(ctx, state.rgb)
    const a = 1.4 - 0.06 * Math.sin(state.time * 0.07)
    const steps = Math.max(1, Math.round(state.dt * 500))
    for (let step = 0; step < steps; step += 1) {
      const nextX = 1 - a * x * x + y
      const nextY = 0.3 * x
      x = nextX
      y = nextY
      if (!Number.isFinite(x) || Math.abs(x) > 4) {
        x = 0.1
        y = 0.3
        continue
      }
      ctx.globalAlpha = 0.7
      ctx.fillRect((x * 0.36 + 0.5) * size, (y * 1.1 + 0.5) * size, 1.3, 1.3)
    }
    ctx.globalAlpha = 1
  }
}

/** The textbook chaotic system — two rods, no closed-form solution, no repeat. */
const doublePendulum: PainterFactory = () => {
  let a1 = Math.PI / 2 + 0.4
  let a2 = Math.PI / 2 + 0.6
  let v1 = 0
  let v2 = 0
  return (ctx, size, state) => {
    decay(ctx, size, 0.035)
    plotter(ctx, state.rgb)

    const steps = Math.max(1, Math.round(state.dt * 400))
    const h = 0.006
    for (let step = 0; step < steps; step += 1) {
      const delta = a1 - a2
      const den = 3 - Math.cos(2 * delta)
      const acc1 =
        (-3 * 9.81 * Math.sin(a1) -
          9.81 * Math.sin(a1 - 2 * a2) -
          2 * Math.sin(delta) * (v2 * v2 + v1 * v1 * Math.cos(delta))) /
        den
      const acc2 =
        (2 *
          Math.sin(delta) *
          (v1 * v1 * 2 + 9.81 * 2 * Math.cos(a1) + v2 * v2 * Math.cos(delta))) /
        den
      v1 += acc1 * h
      v2 += acc2 * h
      a1 += v1 * h
      a2 += v2 * h
    }

    const unit = size * 0.24
    const pivotX = size / 2
    const pivotY = size * 0.36
    const x1 = pivotX + Math.sin(a1) * unit
    const y1 = pivotY + Math.cos(a1) * unit
    const x2 = x1 + Math.sin(a2) * unit
    const y2 = y1 + Math.cos(a2) * unit

    ctx.globalAlpha = 0.85
    ctx.fillRect(x2 - 0.9, y2 - 0.9, 1.8, 1.8)
    ctx.globalAlpha = 0.32
    ctx.strokeStyle = `rgb(${state.rgb[0]},${state.rgb[1]},${state.rgb[2]})`
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(pivotX, pivotY)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

function MandelbrotZoom({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={mandelbrotZoom} />
}
function BurningShip({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={burningShipZoom} />
}
function JuliaMorph({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={juliaMorph} />
}
function LorenzLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={lorenzLive} />
}
function RosslerLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={rosslerLive} />
}
function ThomasLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={thomasLive} />
}
function CliffordLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={cliffordDrift} />
}
function DeJongLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={deJongDrift} />
}
function HenonLive({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={henonSpray} />
}
function DoublePendulum({ size, speed }: Beat) {
  return <LiveCanvas size={size} speed={speed} factory={doublePendulum} />
}

// ─── registry ────────────────────────────────────────────────────────────────

type WorkingState = {
  id: string
  label: string
  family: string
  render: (beat: Beat) => ReactNode
}

const STATES: WorkingState[] = [
  {
    id: "mandelbrot-zoom",
    label: "Mandelbrot zoom",
    family: "Chaotic",
    render: (b) => <MandelbrotZoom {...b} />,
  },
  {
    id: "burning-ship",
    label: "Burning Ship zoom",
    family: "Chaotic",
    render: (b) => <BurningShip {...b} />,
  },
  {
    id: "julia-morph",
    label: "Julia morph",
    family: "Chaotic",
    render: (b) => <JuliaMorph {...b} />,
  },
  { id: "lorenz-live", label: "Lorenz", family: "Chaotic", render: (b) => <LorenzLive {...b} /> },
  {
    id: "rossler-live",
    label: "Rössler",
    family: "Chaotic",
    render: (b) => <RosslerLive {...b} />,
  },
  { id: "thomas-live", label: "Thomas", family: "Chaotic", render: (b) => <ThomasLive {...b} /> },
  {
    id: "clifford-live",
    label: "Clifford drift",
    family: "Chaotic",
    render: (b) => <CliffordLive {...b} />,
  },
  {
    id: "dejong-live",
    label: "De Jong drift",
    family: "Chaotic",
    render: (b) => <DeJongLive {...b} />,
  },
  { id: "henon-live", label: "Hénon map", family: "Chaotic", render: (b) => <HenonLive {...b} /> },
  {
    id: "pendulum-live",
    label: "Double pendulum",
    family: "Chaotic",
    render: (b) => <DoublePendulum {...b} />,
  },

  { id: "orbit", label: "Orbit", family: "Orbital", render: (b) => <Orbit {...b} /> },
  { id: "twin-orbit", label: "Twin orbit", family: "Orbital", render: (b) => <TwinOrbit {...b} /> },
  { id: "comet", label: "Comet", family: "Orbital", render: (b) => <Comet {...b} /> },
  { id: "radar", label: "Radar", family: "Orbital", render: (b) => <Radar {...b} /> },
  {
    id: "gears",
    label: "Counter gears",
    family: "Orbital",
    render: (b) => <CounterGears {...b} />,
  },
  { id: "swarm", label: "Magnet swarm", family: "Orbital", render: (b) => <MagnetSwarm {...b} /> },

  { id: "eight", label: "Figure eight", family: "Path", render: (b) => <FigureEight {...b} /> },
  { id: "pretzel", label: "Pretzel", family: "Path", render: (b) => <Pretzel {...b} /> },
  { id: "spiral", label: "Spiral", family: "Path", render: (b) => <Spiral {...b} /> },
  {
    id: "perimeter",
    label: "Perimeter snake",
    family: "Path",
    render: (b) => <PerimeterSnake {...b} />,
  },
  { id: "weave", label: "Weave", family: "Path", render: (b) => <Weave {...b} /> },
  { id: "zigzag", label: "Zigzag runner", family: "Path", render: (b) => <Zigzag {...b} /> },

  { id: "pendulum", label: "Pendulum", family: "Physical", render: (b) => <Pendulum {...b} /> },
  { id: "bounce", label: "Bounce", family: "Physical", render: (b) => <Bounce {...b} /> },
  { id: "shuttle", label: "Shuttle", family: "Physical", render: (b) => <Shuttle {...b} /> },
  { id: "rain", label: "Rainfall", family: "Physical", render: (b) => <Rainfall {...b} /> },
  { id: "stack", label: "Stack drop", family: "Physical", render: (b) => <StackDrop {...b} /> },
  {
    id: "thread",
    label: "Elastic thread",
    family: "Physical",
    render: (b) => <ElasticThread {...b} />,
  },

  { id: "wave", label: "Wave field", family: "Field", render: (b) => <WaveField {...b} /> },
  { id: "ripple", label: "Ripple field", family: "Field", render: (b) => <RippleField {...b} /> },
  { id: "walk", label: "Random walk", family: "Field", render: (b) => <RandomWalk {...b} /> },
  {
    id: "crosshair",
    label: "Crosshair scan",
    family: "Field",
    render: (b) => <Crosshair {...b} />,
  },
  {
    id: "constellation",
    label: "Constellation",
    family: "Field",
    render: (b) => <Constellation {...b} />,
  },
  { id: "jitter", label: "Jitter cloud", family: "Field", render: (b) => <JitterCloud {...b} /> },
  {
    id: "chladni",
    label: "Chladni nodes",
    family: "Field",
    render: (b) => <ChladniField {...b} />,
  },
  { id: "plasma", label: "Plasma", family: "Field", render: (b) => <PlasmaField {...b} /> },
  {
    id: "lorenz",
    label: "Lorenz attractor",
    family: "Field",
    render: (b) => <LorenzField {...b} />,
  },
  {
    id: "logistic",
    label: "Logistic chaos",
    family: "Field",
    render: (b) => <LogisticField {...b} />,
  },
  { id: "flow", label: "Flow field", family: "Field", render: (b) => <FlowField {...b} /> },
  { id: "moire", label: "Moiré lattice", family: "Field", render: (b) => <MoireField {...b} /> },

  { id: "blob", label: "Morph blob", family: "Blob", render: (b) => <MorphBlob {...b} /> },
  { id: "superblob", label: "Superformula", family: "Blob", render: (b) => <SuperBlob {...b} /> },
  {
    id: "starblob",
    label: "Superformula star",
    family: "Blob",
    render: (b) => <StarBlob {...b} />,
  },
  { id: "roseblob", label: "Rose curve", family: "Blob", render: (b) => <RoseBlob {...b} /> },
  {
    id: "goldenblob",
    label: "Golden wobble",
    family: "Blob",
    render: (b) => <GoldenBlob {...b} />,
  },
  { id: "metablob", label: "Metaball fuse", family: "Blob", render: (b) => <MetaBlob {...b} /> },
  { id: "pinchblob", label: "Liquid pinch", family: "Blob", render: (b) => <PinchBlob {...b} /> },

  { id: "tiles", label: "Flip tiles", family: "Tile", render: (b) => <FlipTiles {...b} /> },
  {
    id: "mandelbrot",
    label: "Escape-time cascade",
    family: "Tile",
    render: (b) => <MandelbrotTiles {...b} />,
  },
  { id: "julia", label: "Orbit cascade", family: "Tile", render: (b) => <JuliaTiles {...b} /> },
  { id: "rule90", label: "Rule 90", family: "Tile", render: (b) => <Rule90Tiles {...b} /> },
  { id: "life", label: "Conway glider", family: "Tile", render: () => <LifeTiles /> },
  {
    id: "sierpinski",
    label: "Sierpiński bitmask",
    family: "Tile",
    render: (b) => <SierpinskiTiles {...b} />,
  },

  { id: "rings", label: "Pulse rings", family: "Form", render: (b) => <PulseRings {...b} /> },
  { id: "petal", label: "Petal bloom", family: "Form", render: (b) => <PetalBloom {...b} /> },
]

const FAMILIES = ["Chaotic", "Field", "Blob", "Tile", "Orbital", "Path", "Physical", "Form"]

const FAMILY_NOTES = new Map(
  Object.entries({
    Chaotic: "Integrated live on a canvas — no keyframe loop, so the picture never repeats.",
    Field: "Many particles, one equation.",
    Blob: "One organic form, driven by a curve equation.",
    Tile: "Big grids. Delay comes from the maths, not from a stagger.",
  }),
)

// ─── canvas ──────────────────────────────────────────────────────────────────

const SIZES = [14, 16, 20, 24, 32]
const SPEEDS = [0.5, 1, 1.6]

export function WorkingStateCanvasEasel() {
  const [size, setSize] = useState(20)
  const [speed, setSpeed] = useState(1)
  const [inContext, setInContext] = useState(false)

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border-weaker-base px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-strong">Working states · 2D canvas</h2>
            <p className="text-xs text-text-weak">
              {STATES.length} loading states that move in two dimensions. The Chaotic family is
              integrated live and never repeats; everything else is a keyframe loop authored at
              24×24.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSize(option)}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-xs transition-colors",
                    size === option
                      ? "bg-surface-interactive-weak font-medium text-text-interactive-base"
                      : "text-text-weak hover:bg-surface-base-hover hover:text-text-base",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {SPEEDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSpeed(option)}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-xs transition-colors",
                    speed === option
                      ? "bg-surface-interactive-weak font-medium text-text-interactive-base"
                      : "text-text-weak hover:bg-surface-base-hover hover:text-text-base",
                  )}
                >
                  {option}×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInContext((value) => !value)}
              className="rounded-md px-2 py-1 text-xs text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
            >
              {inContext ? "Grid" : "In context"}
            </button>
            <Badge variant="outline">Easel</Badge>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {inContext ? (
            <div className="flex max-w-[680px] flex-col gap-2.5">
              {STATES.map((state) => (
                <div key={state.id} className="flex min-w-0 items-start gap-2.5">
                  <span className="pt-0.5">
                    <Stage size={size}>{state.render({ speed, size })}</Stage>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-base">
                      Map startup business notes
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-text-weaker">
                      Identifying glob pattern for Business projects
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-text-weakest">
                    {state.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-7">
              {FAMILIES.map((family) => (
                <section key={family} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-weak">
                      {family}
                    </h3>
                    {FAMILY_NOTES.get(family) ? (
                      <span className="text-xs text-text-weaker">{FAMILY_NOTES.get(family)}</span>
                    ) : null}
                    <span className="h-px min-w-8 flex-1 bg-border-weaker-base" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                    {STATES.filter((state) => state.family === family).map((state) => (
                      <div key={state.id} className="flex items-center gap-3">
                        <span className="flex w-8 shrink-0 justify-center">
                          <Stage size={size}>{state.render({ speed, size })}</Stage>
                        </span>
                        <span className="min-w-0 truncate font-mono text-xs text-text-weak">
                          {state.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  )
}
