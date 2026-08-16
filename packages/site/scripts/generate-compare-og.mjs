/**
 * Generate 1200×630 Open Graph images for every Buddy compare page.
 *
 * Usage (from packages/site):
 *   bun ./scripts/generate-compare-og.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const SITE_ROOT = path.join(scriptDirectory, "..")
const COMPETITORS_DIR = path.join(SITE_ROOT, "src/assets/competitors")
const BUDDY_ICON_PATH = path.join(SITE_ROOT, "src/assets/buddy-app-icon.png")
const OUT_DIR = path.join(SITE_ROOT, "public/og")

const OG_WIDTH = 1200
const OG_HEIGHT = 630
const ICON_SIZE = 220
const ICON_RADIUS = 48
const BUDDY_ACCENT = "#FF6B35"

/** @typedef {{ id: string, competitor: string, file: string, accent: string, plate: "light" | "dark" | "none" }} CompareOgSpec */

/** @type {readonly CompareOgSpec[]} */
const COMPARES = [
  {
    id: "buddy-vs-chatgpt",
    competitor: "ChatGPT",
    file: "chatgpt.svg",
    accent: "#10A37F",
    plate: "dark",
  },
  {
    id: "buddy-vs-claude-teachers",
    competitor: "Claude for Teachers",
    file: "claude.svg",
    accent: "#D97757",
    plate: "light",
  },
  {
    id: "buddy-vs-diffit",
    competitor: "Diffit",
    file: "diffit.webp",
    accent: "#0B9B6B",
    plate: "light",
  },
  {
    id: "buddy-vs-khanmigo",
    competitor: "Khanmigo",
    file: "khanmigo.svg",
    accent: "#14BF96",
    plate: "light",
  },
  {
    id: "buddy-vs-knowt",
    competitor: "Knowt",
    file: "knowt.png",
    accent: "#2DD4BF",
    plate: "none",
  },
  {
    id: "buddy-vs-magicschool",
    competitor: "MagicSchool AI",
    file: "magicschool.png",
    accent: "#7C3AED",
    plate: "light",
  },
  {
    id: "buddy-vs-notebooklm",
    competitor: "NotebookLM",
    file: "notebooklm.svg",
    accent: "#4285F4",
    plate: "light",
  },
  {
    id: "buddy-vs-quizlet",
    competitor: "Quizlet",
    file: "quizlet.svg",
    accent: "#4255FF",
    plate: "light",
  },
  {
    id: "buddy-vs-remnote",
    competitor: "RemNote",
    file: "remnote.svg",
    accent: "#506CF7",
    plate: "light",
  },
]

/**
 * @param {number} size
 * @param {number} radius
 * @param {string} fill
 */
function roundedRectSvg(size, radius, fill) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${fill}"/>
    </svg>`,
  )
}

/**
 * @param {string} filePath
 * @param {number} size
 * @param {"light" | "dark" | "none"} plate
 * @param {boolean} [alreadyAppIcon]
 */
async function makeIconTile(filePath, size, plate, alreadyAppIcon = false) {
  if (alreadyAppIcon || plate === "none") {
    // Cover full tile; knowt/buddy already look like app icons
    const mask = roundedRectSvg(size, ICON_RADIUS, "#fff")
    const resized = await sharp(await readFile(filePath))
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer()

    return sharp(resized)
      .composite([
        {
          input: await sharp(mask).png().toBuffer(),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer()
  }

  const pad = 0.2
  const inner = Math.round(size * (1 - pad * 2))
  const inset = Math.round((size - inner) / 2)
  const bg = plate === "dark" ? "#111113" : "#F4F4F5"

  const mark = await sharp(await readFile(filePath), { density: 400 })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const platePng = await sharp(roundedRectSvg(size, ICON_RADIUS, bg))
    .png()
    .toBuffer()

  return sharp(platePng)
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toBuffer()
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/**
 * @param {CompareOgSpec} spec
 * @param {Buffer} buddyTile
 * @param {Buffer} competitorTile
 */
async function renderOg(spec, buddyTile, competitorTile) {
  const leftX = Math.round(OG_WIDTH / 2 - ICON_SIZE - 70)
  const rightX = Math.round(OG_WIDTH / 2 + 70)
  const iconY = Math.round(OG_HEIGHT / 2 - ICON_SIZE / 2 - 28)
  const labelY = iconY + ICON_SIZE + 28

  // Plain black base + soft radial brand glows (no muddy multi-stop wash)
  const overlay = Buffer.from(`
    <svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glowL" cx="18%" cy="50%" r="48%">
          <stop offset="0%" stop-color="${BUDDY_ACCENT}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${BUDDY_ACCENT}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glowR" cx="82%" cy="50%" r="48%">
          <stop offset="0%" stop-color="${spec.accent}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${spec.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#000000"/>
      <rect width="100%" height="100%" fill="url(#glowL)"/>
      <rect width="100%" height="100%" fill="url(#glowR)"/>
      <text
        x="50%"
        y="${iconY + ICON_SIZE / 2 + 8}"
        text-anchor="middle"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="22"
        font-weight="600"
        letter-spacing="0.2em"
        fill="rgba(255,255,255,0.45)"
      >VS</text>
      <text
        x="${leftX + ICON_SIZE / 2}"
        y="${labelY}"
        text-anchor="middle"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="28"
        font-weight="560"
        fill="rgba(255,255,255,0.92)"
      >Buddy</text>
      <text
        x="${rightX + ICON_SIZE / 2}"
        y="${labelY}"
        text-anchor="middle"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="28"
        font-weight="560"
        fill="rgba(255,255,255,0.92)"
      >${escapeXml(spec.competitor)}</text>
    </svg>
  `)

  return sharp(overlay)
    .composite([
      { input: buddyTile, left: leftX, top: iconY },
      { input: competitorTile, left: rightX, top: iconY },
    ])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const buddyTile = await makeIconTile(BUDDY_ICON_PATH, ICON_SIZE, "none", true)

  for (const spec of COMPARES) {
    const logoPath = path.join(COMPETITORS_DIR, spec.file)
    const competitorTile = await makeIconTile(logoPath, ICON_SIZE, spec.plate, false)
    const png = await renderOg(spec, buddyTile, competitorTile)
    const outPath = path.join(OUT_DIR, `${spec.id}.png`)
    await writeFile(outPath, png)
    const meta = await sharp(png).metadata()
    console.log(
      `wrote ${path.relative(SITE_ROOT, outPath)} (${meta.width}×${meta.height}, ${png.length} bytes)`,
    )
  }

  console.log(`\nDone: ${COMPARES.length} OG images in public/og/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
