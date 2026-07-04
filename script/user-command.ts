#!/usr/bin/env bun

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
