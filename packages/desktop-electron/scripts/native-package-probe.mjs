import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const MAIN_DIR_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_MAIN_DIR"
const PACKAGE_NAME_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_PACKAGE"
const LITEPARSE_PACKAGE_NAME = "@llamaindex/liteparse"
const LITEPARSE_SMOKE_TEXT = "Buddy LiteParse Electron smoke"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(name + " is required")
  return value
}

const mainDir = realpathSync(path.resolve(requiredEnv(MAIN_DIR_ENV)))
const packageName = requiredEnv(PACKAGE_NAME_ENV)
const probeModuleUrl = pathToFileURL(path.join(mainDir, "chunks", "native-probe.mjs"))
const require = createRequire(probeModuleUrl)
const resolvedPath = resolvePackageEntry(packageName)
const resolved = realpathSync(path.resolve(resolvedPath))

if (!resolved.startsWith(mainDir + path.sep)) {
  throw new Error(packageName + " resolved outside isolated Electron output: " + resolved)
}

const loadedPackage = await loadPackage(resolvedPath)
if (packageName === LITEPARSE_PACKAGE_NAME) {
  await assertLiteParseCanParse(loadedPackage)
}

function resolvePackageEntry(name) {
  try {
    return require.resolve(name)
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw error
    }
  }

  const manifestPath = require.resolve(`${name}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const importEntry = manifest.exports?.["."]?.import ?? manifest.module ?? manifest.main
  if (typeof importEntry !== "string" || importEntry.length === 0) {
    throw new Error(`${name} does not expose a loadable package entry`)
  }
  return path.resolve(path.dirname(manifestPath), importEntry)
}

async function loadPackage(packagePath) {
  try {
    return require(packagePath)
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ERR_REQUIRE_ESM") {
      throw error
    }
    return await import(pathToFileURL(packagePath).href)
  }
}

async function assertLiteParseCanParse(loadedPackage) {
  if (
    !loadedPackage ||
    typeof loadedPackage !== "object" ||
    typeof loadedPackage.LiteParse !== "function"
  ) {
    throw new Error("LiteParse package does not export LiteParse")
  }

  const smokeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-liteparse-electron-smoke-"))
  const pdfPath = path.join(smokeRoot, "smoke.pdf")

  try {
    writeFileSync(pdfPath, createTextPdf(LITEPARSE_SMOKE_TEXT), "binary")
    const parser = new loadedPackage.LiteParse({
      imageMode: "off",
      ocrEnabled: false,
      outputFormat: "json",
      quiet: true,
    })
    const result = await parser.parse(pdfPath)
    if (
      !result ||
      typeof result !== "object" ||
      typeof result.text !== "string" ||
      !result.text.includes(LITEPARSE_SMOKE_TEXT)
    ) {
      throw new Error("LiteParse Electron smoke did not extract the expected PDF text")
    }
  } finally {
    rmSync(smokeRoot, { recursive: true, force: true })
  }
}

function createTextPdf(text) {
  const escapedText = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
  const content = `BT\n/F1 24 Tf\n72 720 Td\n(${escapedText}) Tj\nET`
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ])
}

function buildPdf(objects) {
  let body = "%PDF-1.4\n"
  const offsets = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  const xref = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  return `${body}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
}
