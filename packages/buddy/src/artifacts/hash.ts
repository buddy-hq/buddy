import { createHash } from "node:crypto"

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export { sha256Text }
