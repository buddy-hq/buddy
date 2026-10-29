import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { withFileLock } from "../../storage/file-lock"
import { Global } from "../../storage/global"
import { textFileWriteLockPath } from "../../storage/locked-atomic-file"
import { parseNodeErrorCode } from "../../storage/parse-node-error"
import {
  FileRenameConflictError,
  renameFileWithoutOverwrite,
} from "../../storage/rename-file-without-overwrite"

export const SECRET_REFERENCE_PATTERN = /\{secret:([A-Za-z0-9_-]+)\}/gu

const secretStoreSchema = z
  .object({
    version: z.literal(1),
    secrets: z.record(z.string(), z.string()),
  })
  .strict()

export function secretReference(id: string): string {
  return `{secret:${id}}`
}

type SecretStoreRead =
  | { state: "ready"; secrets: Record<string, string> }
  | { state: "broken"; secrets: Record<string, string> }

async function readSecretStore(): Promise<SecretStoreRead> {
  const storePath = path.join(Global.Path.data, "secrets.json")
  try {
    const text = await fs.readFile(storePath, "utf8")
    return { state: "ready", secrets: secretStoreSchema.parse(JSON.parse(text)).secrets }
  } catch (error) {
    if (parseNodeErrorCode(error) === "ENOENT") return { state: "ready", secrets: {} }
    console.warn(`Cannot read secret store; treating it as empty: ${storePath}`)
    return { state: "broken", secrets: {} }
  }
}

export async function readSecrets(): Promise<Readonly<Record<string, string>>> {
  return (await readSecretStore()).secrets
}

async function preserveBrokenSecretStore(storePath: string): Promise<void> {
  const backupPath = `${storePath}.broken-${Date.now()}`
  for (let collision = 0; ; collision += 1) {
    const destination = collision === 0 ? backupPath : `${backupPath}-${collision}`
    try {
      await renameFileWithoutOverwrite(storePath, destination)
      return
    } catch (error) {
      if (!(error instanceof FileRenameConflictError)) throw error
    }
  }
}

async function updateSecrets(update: (secrets: Record<string, string>) => void): Promise<void> {
  const storePath = path.join(Global.Path.data, "secrets.json")
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 })

  await withFileLock(textFileWriteLockPath(storePath), async () => {
    const store = await readSecretStore()
    const secrets = { ...store.secrets }
    update(secrets)
    if (store.state === "broken") await preserveBrokenSecretStore(storePath)
    const temporaryPath = path.join(Global.Path.data, `.secrets.${randomUUID()}.tmp`)

    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify({ version: 1, secrets }, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      })
      await fs.rename(temporaryPath, storePath)
      if (process.platform !== "win32") await fs.chmod(storePath, 0o600)
    } finally {
      await fs.rm(temporaryPath, { force: true })
    }
  })
}

export async function storeSecret(value: string): Promise<string> {
  const id = `sec_${randomUUID().replaceAll("-", "")}`
  await updateSecrets((secrets) => {
    secrets[id] = value
  })
  return id
}

export async function deleteSecrets(ids: readonly string[]): Promise<void> {
  await updateSecrets((secrets) => {
    for (const id of ids) delete secrets[id]
  })
}
