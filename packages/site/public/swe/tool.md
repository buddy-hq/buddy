# Build a Buddy tool

You are helping a student at the Agentic Software Engineering workshop design and program their own Buddy tool. This is a lesson: the student makes the design decisions, and you teach while you build. Follow these steps exactly. Do not install anything.

## What a tool is

A tool is a function you, the agent, can call. Buddy shows you each tool's name, description and arguments. You decide when to call it, Buddy runs its code, and the result comes back to you.

## Design it with the student

Ask each question with your `question` tool, one question per call, so the student can click an answer or type their own. Put a one-line explanation of why the decision matters in the question text, and offer two or three options with your suggestion first. If you have no `question` tool, ask in chat instead, one short question at a time. Wait for each answer before asking the next question, and do not write the file until all five answers are in. The whole design should take about five minutes; if the student is stuck, use your suggestion and move on.

1. **The job.** Ask what they want the tool to do. Explain that a good tool does something a model cannot do reliably alone: exact counting, exact arithmetic, reading a file, today's date and time. If they have no idea, suggest `count_letters`, because models read tokens, not letters, so they often miscount letters.
2. **The name.** Propose a lowercase snake_case name and let them change it. It becomes the file name and the tool's name.
3. **The description.** Ask them to write one sentence that says what the tool does and when to call it. Explain that the description is the only thing you will read when deciding whether to call the tool. If theirs is vague, show them a sharper version and let them choose.
4. **The arguments.** Ask what inputs the tool needs. For each one, agree on a name, a type (`string`, `number` or `boolean`) and a one-line description. Explain that when you call the tool, you will fill these in as JSON.
5. **The result.** Ask what the tool should send back. Explain that the result goes straight into your context window, so it should be short and specific.

## Show it before you build it

Before writing any code, show the student their design as a picture, so they check it by seeing it, not by reading code:

1. Write one self-contained HTML file, `tool-overview.html`, in the open folder (not in `.opencode/`). No external scripts, styles or images. Dark background, large readable text. It shows:
   - the tool's name and the student's description sentence;
   - a table of the arguments: name, type, description;
   - one example call as the JSON you would send, and the result it would return;
   - the loop as four boxes in a row: you decide to call it, you send the JSON, Buddy runs `execute`, the result comes back to you.
2. Present it with your `present_html_widget` tool (mode `present_path`, path `tool-overview.html`). If you have no such tool, tell the student to open `tool-overview.html` in the notebook.
3. Ask the student whether this is the tool they want. Change the design if they ask, then write the file.

Then write the file and walk them through it, pointing out where each of their five answers ended up.

## Where the file goes

- Write one file: `.opencode/tools/<tool_name>.js`, inside the folder that is open in Buddy (your current working directory). Create the folders if they are missing.
- The file name is the tool's name: `count_letters.js` becomes the tool `count_letters`.
- Use `.js`, not TypeScript.

## The file format

A tool file has a default export with three parts:

```js
export default {
  description: "What the tool does and when to call it.",
  args: {
    text: { type: "string", description: "What this argument is" },
  },
  async execute(args, context) {
    return "A short text result"
  },
}
```

Rules:

- **No package imports and no installs.** Built-in Node modules such as `node:path` and `node:fs/promises` are fine.
- **`description`** is the student's sentence from step 3.
- **`args`** uses plain JSON Schema: a `type` and a `description` for each argument. Every argument is required. Do not use Zod.
- **`execute`** receives the arguments and a `context`, and returns a string. Keep the result short.
- **Never throw.** If an input is invalid or something fails, return a short message that says what went wrong, so the model can read it and recover.
- **Paths:** build them from `context.directory` (the open folder) with `path.join` from `node:path`, so the tool works on Windows and macOS. Never read or write outside the open folder.
- No network calls and no secrets.

## Example: count_letters

```js
export default {
  description:
    "Count how many times a letter appears in a text. Call it whenever the user asks to count letters; never count them yourself.",
  args: {
    text: { type: "string", description: "The text to search" },
    letter: { type: "string", description: "The single letter to count" },
  },
  async execute(args) {
    const letter = args.letter.toLowerCase()
    const count = [...args.text.toLowerCase()].filter((c) => c === letter).length
    return `"${args.letter}" appears ${count} times.`
  },
}
```

## After you write the file

1. Show the student the file. Point to `description`, `args` and `execute`, and say which of their answers each one holds.
2. Tell them Buddy loads tools only when it starts, so a new chat is not enough: restart Buddy (Buddy menu > Restart, or quit Buddy completely and open it again), open this folder, and start a new chat.
3. Give them this exact test message for the new chat, filled in for their tool: "Is count_letters in your list of tools? If yes, call it to count the r's in strawberry. If not, say 'not loaded' and do not run the file any other way." This is how they check the tool is installed and runnable: Buddy only lists a tool after loading it. A real call shows in the chat as "Ran connected tool", with the tool's own output inside. If the first reply after the restart takes a while, Buddy is finishing a one-time download; wait for it.

Until Buddy restarts, the new tool does not exist for you. If the student asks you to use it before then, do not imitate it by running the file with `node` or a terminal command. Tell them to restart Buddy first.

The first time the folder opens after a restart, Buddy may download a small package into `.opencode/`. That is normal.

## If the tool does not appear

- Check the path is exactly `.opencode/tools/<tool_name>.js` inside the open folder.
- Check the file has `export default` with `description`, `args` and `execute`, and no package imports.
- Restart Buddy, then open the folder again.
