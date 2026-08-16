import { dvi2svg, load, tex } from "node-tikzjax"
import { CHEMFIG_CHILD_FAILURE_STAGES, type ChemfigChildFailureStage } from "./types"

const CHEMFIG_TEX_PACKAGES = { chemfig: "" } as const
const CHEMFIG_RENDER_OPTIONS = {
  texPackages: CHEMFIG_TEX_PACKAGES,
  embedFontCss: false,
  disableOptimize: false,
  showConsole: false,
} as const

let documentSource = ""

process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk: string) => {
  documentSource += chunk
})
process.stdin.on("end", () => {
  void renderDocument()
})

async function renderDocument(): Promise<void> {
  try {
    await load()
  } catch (error) {
    writeFailure(CHEMFIG_CHILD_FAILURE_STAGES.runtimeInitialization, error)
    return
  }

  let dvi: Buffer
  try {
    dvi = await tex(documentSource, CHEMFIG_RENDER_OPTIONS)
  } catch (error) {
    writeFailure(CHEMFIG_CHILD_FAILURE_STAGES.texCompilation, error)
    return
  }

  try {
    const svg = await dvi2svg(dvi, CHEMFIG_RENDER_OPTIONS)
    process.stdout.write(svg)
  } catch (error) {
    writeFailure(CHEMFIG_CHILD_FAILURE_STAGES.dviConversion, error)
  }
}

function writeFailure<TError>(stage: ChemfigChildFailureStage, error: TError): void {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  process.stderr.write(JSON.stringify({ stage, message, stack }))
  process.exitCode = 1
}
