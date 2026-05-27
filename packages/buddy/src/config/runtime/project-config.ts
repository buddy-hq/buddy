import { Config } from "../config.js"

export async function readProjectConfig(directory: string): Promise<Config.Info> {
  return Config.getProject(directory)
}

export async function readProjectConfigFile(directory: string): Promise<Config.Info> {
  return Config.getProjectFile(directory)
}
