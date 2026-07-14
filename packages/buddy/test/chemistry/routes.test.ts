import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { ChemfigRenderRecordSchema } from "../../src/chemistry/chemfig-renderer"
import { sanitizeChemistrySvg } from "../../src/chemistry/svg-sanitize"
import { CHEMFIG_MAX_REQUEST_BODY_BYTES } from "../../src/chemistry/types"
import { tmpdir } from "../helpers/tmpdir"

async function chemistryRequest(
  directory: string,
  pathname: string,
  init: RequestInit,
): Promise<Response> {
  return app.request(`/api/chemistry${pathname}?directory=${encodeURIComponent(directory)}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-buddy-directory": directory,
      ...init.headers,
    },
  })
}

describe("backend chemistry rendering routes", () => {
  test("exposes only the content-cached chemfig renderer", async () => {
    await using project = await tmpdir({ git: true })
    const source = String.raw`\chemfig{*6(-=-=-=)}`
    const firstResponse = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({ source }),
    })
    expect(firstResponse.status).toBe(200)
    const first = ChemfigRenderRecordSchema.parse(await firstResponse.json())
    expect(first.svg).toStartWith("<svg")

    const secondResponse = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({ source }),
    })
    expect(secondResponse.status).toBe(200)
    const second = ChemfigRenderRecordSchema.parse(await secondResponse.json())
    expect(second).toEqual(first)

    const removedRoutes = await Promise.all([
      chemistryRequest(project.path, "/inline", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      chemistryRequest(project.path, "/object-id/source", { method: "GET" }),
      chemistryRequest(project.path, "/object-id/render-record", { method: "GET" }),
      chemistryRequest(project.path, "/object-id/render-record", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
    ])
    expect(removedRoutes.map((response) => response.status)).toEqual([404, 404, 404, 404])
  }, 20_000)

  test("rejects unsafe chemfig control sequences with a typed error", async () => {
    await using project = await tmpdir({ git: true })
    const response = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({ source: String.raw`\input{/etc/passwd}` }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error:
        "chemfig source contains a document, package, file, or macro control sequence that is not allowed.",
      code: "unsafe_source",
    })
  })

  test("rejects TeX character-expansion bypasses and strips active SVG animation", async () => {
    await using project = await tmpdir({ git: true })
    const response = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({
        source: String.raw`\chemfig{C}\^^73pecial{dvisvgm:raw <a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a>}`,
      }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "unsafe_source" })

    const sanitized = sanitizeChemistrySvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a><path d="M0 0h1"/></svg>',
    )
    expect(sanitized).not.toContain("<a")
    expect(sanitized).not.toContain("<animate")
    expect(sanitized).not.toContain("javascript:")
    expect(sanitized).toContain("<path")
  })

  test("returns the documented typed error for invalid and malformed JSON bodies", async () => {
    await using project = await tmpdir({ git: true })
    const missingSource = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({}),
    })
    expect(missingSource.status).toBe(400)
    expect(await missingSource.json()).toMatchObject({
      code: "invalid_source",
      error: expect.any(String),
    })

    const emptySource = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({ source: "" }),
    })
    expect(emptySource.status).toBe(400)
    expect(await emptySource.json()).toEqual({
      code: "invalid_source",
      error: "Chemistry source is required.",
    })

    const malformedJson = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: "{",
    })
    expect(malformedJson.status).toBe(400)
    expect(await malformedJson.json()).toEqual({
      code: "invalid_source",
      error: "Invalid JSON body.",
    })
  })

  test("rejects oversized request bodies before JSON validation with a typed error", async () => {
    await using project = await tmpdir({ git: true })
    const response = await chemistryRequest(project.path, "/chemfig/render", {
      method: "POST",
      body: JSON.stringify({ source: "C".repeat(CHEMFIG_MAX_REQUEST_BODY_BYTES) }),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: `chemfig request body exceeds the ${CHEMFIG_MAX_REQUEST_BODY_BYTES}-byte limit.`,
      code: "source_too_large",
    })
  })
})
