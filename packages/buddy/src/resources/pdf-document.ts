import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import z from "zod"

const PDF_MATRIX_2D_LENGTH = 6
const PDF_MATRIX_3D_LENGTH = 16
const PDFJS_DOM_MATRIX_GLOBAL = "DOMMatrix" as const
const PDFJS_NODE_CANVAS_PACKAGE = "@napi-rs/canvas" as const
const require = createRequire(import.meta.url)
const pdfJsCanvasModuleSchema = z.object({ DOMMatrix: z.function() })

type PdfJsDOMMatrixArray = {
  readonly length: number
  readonly [index: number]: number | undefined
}

type PdfJsDOMMatrixInit =
  | PdfJsDOMMatrixArray
  | {
      a?: number
      b?: number
      c?: number
      d?: number
      e?: number
      f?: number
      m11?: number
      m12?: number
      m21?: number
      m22?: number
      m41?: number
      m42?: number
    }

function isPdfJsDOMMatrixArray(value: PdfJsDOMMatrixInit): value is PdfJsDOMMatrixArray {
  return "length" in value && Number.isFinite(value.length)
}

class PdfJsDOMMatrixFallback {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  m11 = 1
  m12 = 0
  m13 = 0
  m14 = 0
  m21 = 0
  m22 = 1
  m23 = 0
  m24 = 0
  m31 = 0
  m32 = 0
  m33 = 1
  m34 = 0
  m41 = 0
  m42 = 0
  m43 = 0
  m44 = 1
  is2D = true

  constructor(init?: PdfJsDOMMatrixInit) {
    if (init && isPdfJsDOMMatrixArray(init)) {
      this.#initializeFromArray(init)
      return
    }
    if (init) {
      this.a = init.a ?? init.m11 ?? this.a
      this.b = init.b ?? init.m12 ?? this.b
      this.c = init.c ?? init.m21 ?? this.c
      this.d = init.d ?? init.m22 ?? this.d
      this.e = init.e ?? init.m41 ?? this.e
      this.f = init.f ?? init.m42 ?? this.f
      this.#syncMatrixFields()
    }
  }

  get isIdentity(): boolean {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
    )
  }

  multiply(other?: PdfJsDOMMatrixInit): PdfJsDOMMatrixFallback {
    return new PdfJsDOMMatrixFallback(this).multiplySelf(other)
  }

  multiplySelf(other?: PdfJsDOMMatrixInit): this {
    const matrix = new PdfJsDOMMatrixFallback(other)
    return this.#set2D({
      a: this.a * matrix.a + this.c * matrix.b,
      b: this.b * matrix.a + this.d * matrix.b,
      c: this.a * matrix.c + this.c * matrix.d,
      d: this.b * matrix.c + this.d * matrix.d,
      e: this.a * matrix.e + this.c * matrix.f + this.e,
      f: this.b * matrix.e + this.d * matrix.f + this.f,
    })
  }

  preMultiplySelf(other?: PdfJsDOMMatrixInit): this {
    const matrix = new PdfJsDOMMatrixFallback(other)
    return this.#set2D({
      a: matrix.a * this.a + matrix.c * this.b,
      b: matrix.b * this.a + matrix.d * this.b,
      c: matrix.a * this.c + matrix.c * this.d,
      d: matrix.b * this.c + matrix.d * this.d,
      e: matrix.a * this.e + matrix.c * this.f + matrix.e,
      f: matrix.b * this.e + matrix.d * this.f + matrix.f,
    })
  }

  translate(x = 0, y = 0): PdfJsDOMMatrixFallback {
    return new PdfJsDOMMatrixFallback(this).translateSelf(x, y)
  }

  translateSelf(x = 0, y = 0): this {
    return this.multiplySelf([1, 0, 0, 1, x, y])
  }

  scale(scaleX = 1, scaleY = scaleX): PdfJsDOMMatrixFallback {
    return new PdfJsDOMMatrixFallback(this).scaleSelf(scaleX, scaleY)
  }

  scaleSelf(scaleX = 1, scaleY = scaleX): this {
    return this.multiplySelf([scaleX, 0, 0, scaleY, 0, 0])
  }

  invertSelf(): this {
    const determinant = this.a * this.d - this.b * this.c
    if (determinant === 0) {
      return this.#set2D({
        a: Number.NaN,
        b: Number.NaN,
        c: Number.NaN,
        d: Number.NaN,
        e: Number.NaN,
        f: Number.NaN,
      })
    }

    return this.#set2D({
      a: this.d / determinant,
      b: -this.b / determinant,
      c: -this.c / determinant,
      d: this.a / determinant,
      e: (this.c * this.f - this.d * this.e) / determinant,
      f: (this.b * this.e - this.a * this.f) / determinant,
    })
  }

  #initializeFromArray(init: PdfJsDOMMatrixArray): void {
    if (init.length === PDF_MATRIX_2D_LENGTH) {
      this.#set2D({
        a: init[0] ?? 1,
        b: init[1] ?? 0,
        c: init[2] ?? 0,
        d: init[3] ?? 1,
        e: init[4] ?? 0,
        f: init[5] ?? 0,
      })
      return
    }

    if (init.length === PDF_MATRIX_3D_LENGTH) {
      this.#set2D({
        a: init[0] ?? 1,
        b: init[1] ?? 0,
        c: init[4] ?? 0,
        d: init[5] ?? 1,
        e: init[12] ?? 0,
        f: init[13] ?? 0,
      })
    }
  }

  #set2D(matrix: { a: number; b: number; c: number; d: number; e: number; f: number }): this {
    this.a = matrix.a
    this.b = matrix.b
    this.c = matrix.c
    this.d = matrix.d
    this.e = matrix.e
    this.f = matrix.f
    this.#syncMatrixFields()
    return this
  }

  #syncMatrixFields(): void {
    this.m11 = this.a
    this.m12 = this.b
    this.m21 = this.c
    this.m22 = this.d
    this.m41 = this.e
    this.m42 = this.f
  }
}

function installPdfJsDOMMatrix(): void {
  if (PDFJS_DOM_MATRIX_GLOBAL in globalThis) return
  try {
    const canvasModule = pdfJsCanvasModuleSchema.safeParse(require(PDFJS_NODE_CANVAS_PACKAGE))
    if (canvasModule.success) {
      Object.defineProperty(globalThis, PDFJS_DOM_MATRIX_GLOBAL, {
        configurable: true,
        writable: true,
        value: canvasModule.data.DOMMatrix,
      })
      return
    }
  } catch {
    // The checkout-independent Node artifact intentionally has no general node_modules tree.
  }
  Object.defineProperty(globalThis, PDFJS_DOM_MATRIX_GLOBAL, {
    configurable: true,
    writable: true,
    value: PdfJsDOMMatrixFallback,
  })
}

let pdfJsModuleTask: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | undefined

async function initializePdfJs(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  installPdfJsDOMMatrix()
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
  return await import("pdfjs-dist/legacy/build/pdf.mjs")
}

export async function loadPdfJs(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  const task = pdfJsModuleTask ?? initializePdfJs()
  pdfJsModuleTask = task
  try {
    return await task
  } catch (error) {
    if (pdfJsModuleTask === task) pdfJsModuleTask = undefined
    throw error
  }
}

export type PdfJsDocument = Awaited<
  ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>["promise"]
>

export async function openPdfDocument(
  sourcePath: string,
): Promise<{ document: PdfJsDocument; [Symbol.asyncDispose]: () => Promise<void> }> {
  const pdfjs = await loadPdfJs()
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await readFile(sourcePath)),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  })
  try {
    const document = await loadingTask.promise
    return {
      document,
      [Symbol.asyncDispose]: async () => {
        await document.destroy()
      },
    }
  } catch (error) {
    await loadingTask.destroy()
    throw error
  }
}

export async function withPdfDocument<TResult>(
  sourcePath: string,
  operation: (document: PdfJsDocument) => Promise<TResult> | TResult,
): Promise<TResult> {
  await using opened = await openPdfDocument(sourcePath)
  return await operation(opened.document)
}

export async function readPdfDocumentPageCount(sourcePath: string): Promise<number> {
  return await withPdfDocument(sourcePath, (document) => {
    if (!Number.isSafeInteger(document.numPages) || document.numPages <= 0) {
      throw new Error("PDF page count is invalid")
    }
    return document.numPages
  })
}
