import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import {
  prepareRuntimeCommandBody,
  readValidatedJsonObject,
} from "../src/session/orchestration/sdk-session"

describe("sdk session body parsing", () => {
  test("reads JSON after validator consumed the raw request body", async () => {
    const app = new Hono().post(
      "/",
      validator(
        "json",
        z.object({
          title: z.string(),
        }),
      ),
      async (c) => {
        const body = await readValidatedJsonObject(c)
        if (body instanceof Response) return body
        return c.json({ body })
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

  test("defaults command arguments to an empty string when omitted", async () => {
    expect(
      await prepareRuntimeCommandBody(
        {
          command: "init",
        },
        { directory: "/tmp/notebook" },
      ),
    ).toEqual({
      command: "init",
      arguments: "",
    })
  })

  test("preserves explicit command arguments", async () => {
    expect(
      await prepareRuntimeCommandBody(
        {
          command: "init",
          arguments: "topic",
        },
        { directory: "/tmp/notebook" },
      ),
    ).toEqual({
      command: "init",
      arguments: "topic",
    })
  })
})
