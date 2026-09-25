<p align="center">
  <img src=".github/assets/buddy-icon.png" alt="Buddy" width="112" height="112">
</p>

<h1 align="center">Buddy</h1>

<p align="center">
  <strong>An AI agent for the curious.</strong><br>
  Read, take notes, draw, build simulations, and practice, all in one desktop app on your own computer.
</p>

<p align="center">
  <a href="https://hibuddy.in/install">Download</a> ·
  <a href="https://www.youtube.com/watch?v=FCq4janO7pE">Watch the launch video</a> ·
  <a href="https://hibuddy.in">hibuddy.in</a>
</p>

---

Buddy is for anyone learning anything: a student preparing for exams, an adult chasing a curiosity, or a teacher building tomorrow's lesson. It runs on macOS and Windows and needs no account. Your chats, notes, and files stay on your machine. The only thing that goes online is the call to the AI model you choose.

## Install

Download Buddy from **[hibuddy.in/install](https://hibuddy.in/install)**, or install it from a terminal.

macOS:

```bash
curl -fsSL https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/install-buddy-macos.sh | bash
```

Windows, in PowerShell:

```powershell
irm -UseBasicParsing https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/install-buddy-windows.ps1 | iex
```

Every release is published on [buddy-releases](https://github.com/prashantbhudwal/buddy-releases/releases).

## For learners

- **Read:** open a PDF or EPUB beside the conversation. Highlight a passage, ask about it, and keep the source in view.
- **Notes:** open your existing Obsidian vault. Wikilinks, embeds, and callouts keep working, and Buddy reads and writes plain Markdown.
- **Whiteboard:** Buddy sketches an idea step by step, then hands you the board.
- **Simulations:** turn an explanation into a game, model, or experiment you can interact with.
- **Remember:** get quizzes and flashcard decks with spaced repetition built in.
- **Research, advanced math, and graphing:** the math and graphing run on Python.

## For educators

- **Plan:** give Buddy a topic, a grade, and your class to get a lesson with objectives, sequence, timing, and an exit ticket.
- **Differentiate:** get a worksheet at three levels (support, on-level, and extension).
- **Assess:** get formative checks, question sets, and answer keys, with each question tagged by Bloom's level and likely misconceptions flagged.
- **Build:** make slide decks, DOCX handouts, sheets, simulations, and interactive diagrams, and open them right in the app.
- **Standards:** CCSS, NGSS, all 50 U.S. state standards, NCERT, Indian state boards, or your own textbooks and framework.
- **Learning science:** Bloom's Taxonomy, Webb's DOK, Understanding by Design, UDL, 5E, gradual release, SOLO, project-based learning, and more.

## Bring your own AI

There's no subscription to sell. Buddy includes free models to start. You can also sign in with ChatGPT or GitHub Copilot, bring your own API keys for 50+ providers, or run local models through Ollama.

Under the hood Buddy is a full agent, with subagents, skills, MCP servers, and custom tools. It asks before it touches a file or takes an action.

## License

Buddy is **source-available, not open source**. Its code is under the [O'Saasy License](LICENSE), which grants everything MIT does except the right to offer Buddy as a competing hosted service.

Third-party code keeps its own license. That includes [OpenCode](https://github.com/anomalyco/opencode) (MIT) in `vendor/opencode/`, which is vendored because it isn't published as a package. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the rest.

## Contributing

Issues and pull requests are welcome, though none come with a promise of a response. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and the checks a PR has to pass. Report security issues privately through [SECURITY.md](SECURITY.md). By participating, you agree to the [code of conduct](CODE_OF_CONDUCT.md).
