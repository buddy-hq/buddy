import { describe, expect, test } from "bun:test"
import { buildChromaFilter, parseArguments } from "./remove-image-background"

describe("remove-image-background", () => {
  test("uses chroma background removal defaults for a batch request", () => {
    expect(
      parseArguments(["--input", "assets/raw/mascot/raw", "--output", "assets/mascot"]),
    ).toEqual({
      kind: "run",
      options: {
        blend: 0.04,
        dryRun: false,
        inputPaths: ["assets/raw/mascot/raw"],
        keyColor: "0x00FF00",
        mode: "chroma",
        normalizeDimension: undefined,
        operation: "background",
        outputDirectory: "assets/mascot",
        outputFormat: "png",
        overwrite: false,
        resizeDimension: undefined,
        similarity: 0.16,
        webpQuality: 90,
      },
    })
  })

  test("infers resize-only processing when --resize is supplied", () => {
    expect(
      parseArguments([
        "--input",
        "assets/mascot",
        "--output",
        "assets/skills",
        "--resize",
        "256",
        "--format",
        "webp",
      ]),
    ).toEqual({
      kind: "run",
      options: {
        blend: 0.04,
        dryRun: false,
        inputPaths: ["assets/mascot"],
        keyColor: "0x00FF00",
        mode: "chroma",
        normalizeDimension: undefined,
        operation: "resize",
        outputDirectory: "assets/skills",
        outputFormat: "webp",
        overwrite: false,
        resizeDimension: 256,
        similarity: 0.16,
        webpQuality: 90,
      },
    })
  })

  test("accepts a background removal followed by a resize", () => {
    expect(
      parseArguments([
        "--input",
        "assets/raw/mascot/raw",
        "--output",
        "assets/mascot",
        "--operation",
        "both",
        "--resize",
        "512",
        "--format",
        "webp",
      ]),
    ).toMatchObject({
      kind: "run",
      options: {
        operation: "both",
        outputFormat: "webp",
        resizeDimension: 512,
      },
    })
  })

  test("accepts visible-content normalization after resizing", () => {
    expect(
      parseArguments([
        "--input",
        "assets/raw/skills",
        "--output",
        "assets/skills",
        "--operation",
        "both",
        "--resize",
        "512",
        "--normalize",
        "400",
      ]),
    ).toMatchObject({
      kind: "run",
      options: {
        normalizeDimension: 400,
        resizeDimension: 512,
      },
    })
  })

  test("rejects normalization larger than the resized canvas", () => {
    expect(() =>
      parseArguments([
        "--input",
        "assets/raw/skills",
        "--output",
        "assets/skills",
        "--operation",
        "resize",
        "--resize",
        "256",
        "--normalize",
        "400",
      ]),
    ).toThrow("--normalize cannot exceed --resize")
  })

  test("builds a despilled chroma filter with supplied edge settings", () => {
    expect(
      buildChromaFilter({
        blend: 0.08,
        keyColor: "0x00FF00",
        similarity: 0.2,
      }),
    ).toBe("colorkey=0x00FF00:0.2:0.08,despill=green:mix=0.5:expand=0")
  })

  test("uses blue despill for a blue chroma key", () => {
    expect(
      buildChromaFilter({
        blend: 0.08,
        keyColor: "0x0000FF",
        similarity: 0.2,
      }),
    ).toBe("colorkey=0x0000FF:0.2:0.08,despill=blue:mix=0.5:expand=0")
  })

  test("rejects resize dimensions without an operation that resizes", () => {
    expect(() =>
      parseArguments([
        "--input",
        "assets/raw/mascot/raw",
        "--output",
        "assets/mascot",
        "--operation",
        "background",
        "--resize",
        "256",
      ]),
    ).toThrow('--resize requires --operation "resize" or "both"')
  })
})
