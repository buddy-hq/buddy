import readline from "node:readline"
import z from "zod"

const rpc = z.object({ id: z.union([z.string(), z.number()]).optional(), method: z.string() })
const input = readline.createInterface({ input: process.stdin })
for await (const line of input) {
  const request = rpc.parse(JSON.parse(line))
  if (request.id === undefined) continue
  const result =
    request.method === "initialize"
      ? {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {}, prompts: {}, resources: {} },
          serverInfo: { name: "conformance-local", version: "1" },
        }
      : request.method === "tools/list"
        ? {
            tools: [
              {
                name: "fixture_lookup",
                description: "Read the fixture",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          }
        : request.method === "tools/call"
          ? { content: [{ type: "text", text: "Local fixture result." }] }
          : request.method === "prompts/list"
            ? { prompts: [] }
            : request.method === "resources/list"
              ? { resources: [] }
              : request.method === "resources/templates/list"
                ? { resourceTemplates: [] }
                : {}
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`)
}
