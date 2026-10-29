import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { generateSpecs } from "hono-openapi"
import { createAuthRoutes } from "../src/routes/auth"
import { createProviderRoutes } from "../src/routes/provider"
import type { ProviderAuthAnswers } from "@buddy/agent-runtime/providers"
import { getAgentRuntime, closeAgentRuntime } from "../src/runtime/agent-runtime"
import { temporaryDirectory } from "./helpers/temporary-directory"
import { temporaryEnvironment } from "./helpers/temporary-environment"

test("the generated auth/provider SDK sends the dialog's named auth body and form answers", async () => {
  await using project = await temporaryDirectory({ prefix: "buddy-auth-sdk-project-" })
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: project.path })
  void environment
  const runtime = await getAgentRuntime()
  await using cleanup = { [Symbol.asyncDispose]: closeAgentRuntime }
  void cleanup
  let stored: { directory: string; providerID: string; key: string; answers?: ProviderAuthAnswers } | undefined
  const input = { getRuntime: async () => ({ chatgpt: runtime.chatgpt, providers: { ...runtime.providers,
    async setKey(directory: string, providerID: string, key: string, answers?: ProviderAuthAnswers) {
      stored = { directory, providerID, key, answers }
    },
  } }) }
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
    headers: { "x-buddy-directory": project.path },
    fetch: async (request: Request) => {
      bodies.push(await request.clone().json())
      return app.request(new URL(request.url).pathname, request)
    },
  }) })
  const result = await client.auth.set({ providerID: "openai", auth: { type: "api", key: "fixture-sdk-key", answers: { deployment: "public" } } })
  expect(result.error).toBeUndefined()
  expect(result.data).toBe(true)
  expect(bodies).toEqual([{ type: "api", key: "fixture-sdk-key", answers: { deployment: "public" } }])
  expect(stored).toEqual({ directory: await fs.realpath(project.path), providerID: "openai", key: "fixture-sdk-key", answers: { deployment: "public" } })
})
