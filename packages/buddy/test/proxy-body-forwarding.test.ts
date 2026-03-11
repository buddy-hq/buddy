import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { prepareProxyBody } from "../src/http"

describe("proxy body forwarding", () => {
  test("forwards JSON after validator consumed the raw request body", async () => {
    const app = new Hono().post(
      "/",
      validator(
        "json",
        z.object({
          title: z.string(),
        }),
      ),
      async (c) => {
        const prepared = await prepareProxyBody(c, { targetPath: "/session/test" })
        if (!prepared.ok) return prepared.response

        const body = prepared.body === undefined ? undefined : await new Response(prepared.body).json()
        return c.json({
          body,
        })
      },
    )

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Renamed",
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      body: {
        title: "Renamed",
      },
    })
  })
})
