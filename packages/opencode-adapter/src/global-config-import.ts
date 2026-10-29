import type { Stats } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"

const V1_GLOBAL_CONFIG_FILE_NAME = "config.json"
const V2_GLOBAL_CONFIG_FILE_NAMES = ["opencode.json", "opencode.jsonc"] as const
const V2_GLOBAL_CONFIG_COPY_NAME = "opencode.jsonc"
const PRIVATE_FILE_MODE = 0o600

const errnoSchema = z.object({ code: z.string() })

function errnoCode<TError>(error: TError): string | undefined {
  const parsed = errnoSchema.safeParse(error)
  return parsed.success ? parsed.data.code : undefined
}

function errorText<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

async function statIfPresent(
  file: string,
  read: (file: string) => Promise<Stats>,
): Promise<Stats | undefined> {
  try {
    return await read(file)
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return undefined
    throw error
  }
}

async function existingV2GlobalConfig(configDirectory: string): Promise<string | undefined> {
  for (const name of V2_GLOBAL_CONFIG_FILE_NAMES) {
    const file = path.join(configDirectory, name)
    if (await statIfPresent(file, fs.lstat)) return file
  }
  return undefined
}

export async function publishCopy(
  source: string,
  target: string,
  link: (existing: string, target: string) => Promise<void> = fs.link,
) {
  const temporary = `${target}.${process.pid}.tmp`
  await fs.writeFile(temporary, await fs.readFile(source), { mode: PRIVATE_FILE_MODE })
  await fs.chmod(temporary, PRIVATE_FILE_MODE)
  try {
    try {
      await link(temporary, target)
    } catch (error) {
      if (errnoCode(error) === "EEXIST") return
      try {
        await fs.copyFile(temporary, target, fs.constants.COPYFILE_EXCL)
      } catch (copyError) {
        if (errnoCode(copyError) === "EEXIST") return
        throw copyError
      }
    }
    if (process.platform !== "win32") await fs.chmod(target, PRIVATE_FILE_MODE)
    console.warn("Copied the previous version's global OpenCode config so this version reads it:", {
      from: source,
      to: target,
    })
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

export async function importV1GlobalConfig(configDirectory: string): Promise<void> {
  const source = path.join(configDirectory, V1_GLOBAL_CONFIG_FILE_NAME)
  try {
    const sourceStats = await statIfPresent(source, fs.stat)
    if (!sourceStats?.isFile()) return
    const current = await existingV2GlobalConfig(configDirectory)
    if (current) {
      console.warn(
        `${source} is no longer read; global OpenCode settings now come only from ${current}.`,
      )
      return
    }
    await publishCopy(source, path.join(configDirectory, V2_GLOBAL_CONFIG_COPY_NAME))
  } catch (error) {
    console.warn(
      "Could not carry over the previous version's global OpenCode config:",
      errorText(error),
    )
  }
}
