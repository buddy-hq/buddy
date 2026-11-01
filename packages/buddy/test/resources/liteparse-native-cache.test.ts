import { expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cacheLiteparseNativeFiles } from "../../src/resources/liteparse-native-cache"

const files = {
  binding: Buffer.from("test LiteParse addon"),
  pdfium: Buffer.from("test PDFium library"),
  libraryName: "test-pdfium.dll",
}

test("reuses private content-addressed native files and repairs either missing or corrupt file", () => {
  const binding = cacheLiteparseNativeFiles(files)
  const directory = path.dirname(binding)
  const library = path.join(directory, files.libraryName)
  expect(path.basename(directory)).toMatch(/^[a-f0-9]{64}$/u)
  if (process.platform !== "win32") expect(statSync(directory).mode & 0o777).toBe(0o700)
  const original = statSync(binding)
  expect(cacheLiteparseNativeFiles(files)).toBe(binding)
  expect(statSync(binding).mtimeMs).toBe(original.mtimeMs)
  expect(statSync(binding).ctimeMs).toBe(original.ctimeMs)
  writeFileSync(library, "corrupt PDFium")
  expect(cacheLiteparseNativeFiles(files)).toBe(binding)
  expect(readFileSync(library)).toEqual(files.pdfium)
  expect(statSync(binding).ctimeMs).toBe(original.ctimeMs)
  writeFileSync(binding, "corrupt addon")
  cacheLiteparseNativeFiles(files)
  expect(readFileSync(binding)).toEqual(files.binding)
  unlinkSync(library)
  cacheLiteparseNativeFiles(files)
  expect(readFileSync(library)).toEqual(files.pdfium)
  expect(
    readdirSync(path.dirname(directory)).filter((name) =>
      name.startsWith(path.basename(directory)),
    ),
  ).toEqual([path.basename(directory)])
})

test("separates embedded native versions by their content", () => {
  const first = cacheLiteparseNativeFiles(files)
  const second = cacheLiteparseNativeFiles({ ...files, binding: Buffer.from("next addon") })
  const third = cacheLiteparseNativeFiles({ ...files, pdfium: Buffer.from("next PDFium") })
  expect(new Set([first, second, third]).size).toBe(3)
  expect(readFileSync(first)).toEqual(files.binding)
  expect(readFileSync(second)).toEqual(Buffer.from("next addon"))
})

test("concurrent instances publish and reuse one complete directory", async () => {
  const modulePath = new URL("../../src/resources/liteparse-native-cache.ts", import.meta.url).href
  const script = `
    import { cacheLiteparseNativeFiles } from ${JSON.stringify(modulePath)};
    process.stdout.write(cacheLiteparseNativeFiles({
      binding: Buffer.alloc(2_000_000, 1),
      pdfium: Buffer.alloc(2_000_000, 2),
      libraryName: "concurrent-pdfium.dll",
    }));
  `
  const children = Array.from({ length: 4 }, () =>
    Bun.spawn([process.execPath, "-e", script], {
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    }),
  )
  const results = await Promise.all(
    children.map(async (child) => ({
      code: await child.exited,
      stdout: await new Response(child.stdout).text(),
      stderr: await new Response(child.stderr).text(),
    })),
  )
  for (const result of results) {
    expect(result.stderr).toBe("")
    expect(result.code).toBe(0)
  }
  expect(new Set(results.map((result) => result.stdout)).size).toBe(1)
  const binding = results[0]?.stdout
  if (!binding) throw new Error("Concurrent cache instances did not return a binding")
  expect(readFileSync(binding)).toEqual(Buffer.alloc(2_000_000, 1))
  expect(readFileSync(path.join(path.dirname(binding), "concurrent-pdfium.dll"))).toEqual(
    Buffer.alloc(2_000_000, 2),
  )
  expect(
    readdirSync(path.dirname(path.dirname(binding))).every((name) => /^[a-f0-9]{64}$/u.test(name)),
  ).toBe(true)
})
