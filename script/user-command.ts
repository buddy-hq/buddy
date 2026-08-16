#!/usr/bin/env bun
// When removing constant commands, remove them from the array, not from the constants.
export const commandNew =
  "when i say v2 of something i mean internal apis. check docs/v2 for comaparison i last did. you are supposed to bring all those to v2. the comparison was done by an older model. make sure you cross check befrore implementing."
export const cleanupCommand =
  "while you are doing migrations if you come across a bad pattern or cleanup opportunity that will make your work simpler, feel free to take it. this includes cleaning up of badly written tests."

const messages: string[] = []

const SCRIPT_PATH = "script/user-command.ts"

function main(): void {
  if (messages.length === 0) return

  console.log("<userMessage>")

  for (const message of messages) {
    console.log(message)
  }

  console.log(
    `<instructions>this was added by user. you can remove the line from array AFTER the message commands are completed. ${SCRIPT_PATH}</instructions>`,
  )

  console.log("</userMessage>")
}

main()
