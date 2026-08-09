import { cancel, confirm, isCancel, select } from "@clack/prompts"
import { typePromptConfig, typePromptTiming } from "./type-prompt.config"

const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const STANDARD_CHARACTERS_PER_WORD = 5
const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND
const NO_PROMPTS = 0
const PROMPT_CATALOG_URL = new URL("../prompts.json", import.meta.url)
const RETURN_KEY_CODE = 36
const SPACE = " "
const DEFAULT_ACTIVATION_DELAY_MILLISECONDS =
  typePromptTiming.pauseMilliseconds[typePromptConfig.timing.beforeTyping]
const DEFAULT_SUBMIT_DELAY_MILLISECONDS =
  typePromptTiming.pauseMilliseconds[typePromptConfig.timing.beforeSubmit]

type PromptDefinition = {
  readonly id: string
  readonly prompt: string
}

type CommandOptions = {
  readonly prompt: string | undefined
  readonly submit: boolean
}

type TypingConfiguration = CommandOptions & {
  readonly activationDelayMilliseconds: number
  readonly appName: string
  readonly characterDelayMilliseconds: number
  readonly prompt: string
  readonly submitDelayMilliseconds: number
}

const characterDelayFromWordsPerMinute = (wordsPerMinute: number): number => {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new Error("timing.wordsPerMinute must be greater than zero.")
  }

  // WPM convention: one word is five characters.
  // Example: 60 WPM = 300 characters/minute = one keystroke every 200 ms.
  return MILLISECONDS_PER_MINUTE / (wordsPerMinute * STANDARD_CHARACTERS_PER_WORD)
}

const DEFAULT_CHARACTER_DELAY_MILLISECONDS = characterDelayFromWordsPerMinute(
  typePromptConfig.timing.wordsPerMinute,
)

const usage = `
Usage:
  bun type [options] ["Prompt text"]

Options:
  --submit                 Press Return after typing a supplied prompt.
`

const isPromptDefinition = (value: unknown): value is PromptDefinition => {
  if (typeof value !== "object" || value === null) {
    return false
  }

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "prompt" in value &&
    typeof value.prompt === "string"
  )
}

const parseArguments = (args: readonly string[]): CommandOptions => {
  const promptParts: string[] = []
  let submit = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === "--help") {
      process.stdout.write(usage)
      process.exit(EXIT_SUCCESS)
    }

    if (argument === "--submit") {
      submit = true
      continue
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`)
    }

    promptParts.push(argument)
  }

  const prompt = promptParts.join(SPACE) || undefined

  return {
    prompt,
    submit,
  }
}

const loadPrompts = async (): Promise<readonly PromptDefinition[]> => {
  const promptCatalog = Bun.file(PROMPT_CATALOG_URL)

  if (!(await promptCatalog.exists())) {
    throw new Error("The prompt catalog is missing.")
  }

  const value: unknown = await promptCatalog.json()

  if (!Array.isArray(value)) {
    throw new Error("The prompt catalog must contain a JSON array.")
  }

  const prompts = value.map((entry) => {
    if (!isPromptDefinition(entry) || !entry.id || !entry.prompt) {
      throw new Error("Every prompt needs a non-empty id and prompt.")
    }

    return entry
  })

  if (prompts.length === NO_PROMPTS) {
    throw new Error("The prompt catalog has no prompts to choose from.")
  }

  return prompts
}

const choosePrompt = async (): Promise<string | undefined> => {
  const prompts = await loadPrompts()
  const selectedId = await select({
    message: typePromptConfig.interactive.promptSelectionMessage,
    options: prompts.map((prompt) => ({
      label: prompt.prompt,
      value: prompt.id,
    })),
  })

  if (isCancel(selectedId)) {
    cancel(typePromptConfig.interactive.cancellationMessage)
    return undefined
  }

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedId)

  if (!selectedPrompt) {
    throw new Error("The selected prompt no longer exists in the prompt catalog.")
  }

  return selectedPrompt.prompt
}

const chooseSubmission = async (): Promise<boolean | undefined> => {
  const shouldSubmit = await confirm({
    initialValue: typePromptConfig.interactive.submitDefault,
    message: typePromptConfig.interactive.submitConfirmationMessage,
  })

  if (isCancel(shouldSubmit)) {
    cancel(typePromptConfig.interactive.cancellationMessage)
    return undefined
  }

  return shouldSubmit
}

const automationScript = `
on run argv
  set promptText to item 1 of argv
  set characterDelaySeconds to (item 2 of argv) as real
  set shouldSubmit to item 3 of argv
  set submitKeyCode to (item 4 of argv) as integer
  set submitDelaySeconds to (item 5 of argv) as real

  tell application "System Events"
    repeat with characterToType in characters of promptText
      keystroke (characterToType as text)
      delay characterDelaySeconds
    end repeat

    if shouldSubmit is "true" then
      delay submitDelaySeconds
      key code submitKeyCode
    end if
  end tell
end run
`

const run = async (): Promise<void> => {
  const options = parseArguments(process.argv.slice(2))
  const prompt = options.prompt ?? (await choosePrompt())

  if (!prompt) {
    return
  }

  const submit = options.prompt ? options.submit : await chooseSubmission()

  if (submit === undefined) {
    return
  }

  const configuration: TypingConfiguration = {
    ...options,
    activationDelayMilliseconds: DEFAULT_ACTIVATION_DELAY_MILLISECONDS,
    appName: typePromptConfig.appName,
    characterDelayMilliseconds: DEFAULT_CHARACTER_DELAY_MILLISECONDS,
    prompt,
    submit,
    submitDelayMilliseconds: DEFAULT_SUBMIT_DELAY_MILLISECONDS,
  }
  const activateApp = Bun.spawn(["open", "-a", configuration.appName], {
    stderr: "inherit",
    stdout: "inherit",
  })
  const activationExitCode = await activateApp.exited

  if (activationExitCode !== EXIT_SUCCESS) {
    throw new Error(`Could not activate the macOS app “${configuration.appName}”.`)
  }

  await Bun.sleep(configuration.activationDelayMilliseconds)

  const typePrompt = Bun.spawn(
    [
      "osascript",
      "-l",
      "AppleScript",
      "-e",
      automationScript,
      "--",
      configuration.prompt,
      String(configuration.characterDelayMilliseconds / MILLISECONDS_PER_SECOND),
      String(configuration.submit),
      String(RETURN_KEY_CODE),
      String(configuration.submitDelayMilliseconds / MILLISECONDS_PER_SECOND),
    ],
    {
      stderr: "inherit",
      stdout: "inherit",
    },
  )
  const typingExitCode = await typePrompt.exited

  if (typingExitCode !== EXIT_SUCCESS) {
    throw new Error(
      "macOS did not allow the typing automation. Give your terminal Accessibility permission in System Settings > Privacy & Security > Accessibility.",
    )
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Typing failed."
  process.stderr.write(`${message}\n`)
  process.exit(EXIT_FAILURE)
})
