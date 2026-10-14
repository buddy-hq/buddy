import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { generateSpecs } from "hono-openapi"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { createProviderCatalogPlugin } from "@buddy/opencode-adapter/gateway/provider"
import { createAuthRoutes } from "../src/routes/auth"
import { createProviderRoutes } from "../src/routes/provider"
import { createNotebookTestHost } from "./helpers/opencode"
import { temporaryDirectory } from "./helpers/temporary-directory"
import { temporaryEnvironment } from "./helpers/temporary-environment"

test("the generated auth/provider SDK sends the dialog's named auth body and form answers", async () => {
  await using runtime = await createNotebookTestHost({ plugins: [createProviderCatalogPlugin(), Plugin.define({ id: "buddy.test.sdk-key-form", async setup(ctx) {
    await ctx.integration.transform((editor) => editor.method.update({ integrationID: "openai", method: { type: "key", form: [{ type: "string", key: "deployment", title: "Deployment", required: true }] } }))
  } })] })
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: runtime.root })
  void environment
  const input = { getClient: async () => runtime.host }
  const app = new Hono().route("/auth", createAuthRoutes(input)).route("/provider", createProviderRoutes(input))
  await using output = await temporaryDirectory({ prefix: "buddy-auth-sdk-" })
  const specPath = path.join(output.path, "openapi.json")
  await fs.writeFile(specPath, JSON.stringify(await generateSpecs(app)))
  const sdkDirectory = path.resolve(import.meta.dir, "../../sdk")
  const generatedPath = path.join(output.path, "generated")
  const process = Bun.spawn(["bun", "--eval", `
    import { createClient } from "@hey-api/openapi-ts"
    await createClient({
      input: ${JSON.stringify(specPath)},
      output: { path: ${JSON.stringify(generatedPath)}, tsConfigPath: ${JSON.stringify(path.join(sdkDirectory, "tsconfig.json"))}, clean: true },
      plugins: [
        { name: "@hey-api/typescript", exportFromIndex: false },
        { name: "@hey-api/sdk", operations: { strategy: "single", containerName: "BuddyClient", methods: "instance" }, exportFromIndex: false, auth: false, paramsStructure: "flat" },
        { name: "@hey-api/client-fetch", exportFromIndex: false, baseUrl: "/api" },
      ],
    })
  `], { cwd: sdkDirectory, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
  if (code !== 0) throw new Error(`SDK generation failed: ${stdout}\n${stderr}`)
  const generated = await import(path.join(generatedPath, "sdk.gen.ts"))
  const clientModule = await import(path.join(generatedPath, "client/index.ts"))
  const bodies: unknown[] = []
  const client = new generated.BuddyClient({ client: clientModule.createClient({
    baseUrl: "https://buddy.example.test",
    headers: { "x-buddy-directory": runtime.root },
    fetch: async (request: Request) => {
      bodies.push(await request.clone().json())
      return app.request(new URL(request.url).pathname, request)
    },
  }) })
  const result = await client.auth.set({ providerID: "openai", auth: { type: "api", key: "fixture-sdk-key", answers: { deployment: "public" } } })
  expect(result.error).toBeUndefined()
  expect(result.data).toBe(true)
  expect(bodies).toEqual([{ type: "api", key: "fixture-sdk-key", answers: { deployment: "public" } }])
  expect((await runtime.host.credential.list()).some((entry) => entry.integrationID === "openai" && entry.value.type === "key" && entry.value.key === "fixture-sdk-key")).toBe(true)
})
