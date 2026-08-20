# Buddy

A learning app for anyone who wants to learn anything. A student preparing for exams, an adult chasing a curiosity, or a teacher building a lesson for a class.

Buddy runs on your own machine. Downloads are at [buddy-releases](https://github.com/prashantbhudwal/buddy-releases/releases).

## Built on OpenCode

Buddy is built on [OpenCode](https://github.com/sst/opencode), and it is not a small dependency. A full copy of OpenCode lives in `vendor/`, roughly 6,450 files, and it is the agent runtime underneath everything here: the loop, sessions, tools, and permissions all run from those modules.

What Buddy adds is the teaching layer on top. Curriculum and standards, the reading and drawing and math surfaces, the pedagogical models, and the desktop app around it. `packages/opencode-adapter` is the seam between the two.

The vendored code stays MIT and belongs to the OpenCode authors. Buddy does not patch it. It is refreshed from upstream wholesale, and a CI job fails the build if anything drifts.

## Install

macOS:

```bash
curl -fsSL https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/install-buddy-macos.sh | bash
```

Windows, in PowerShell:

```powershell
irm -UseBasicParsing https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/install-buddy-windows.ps1 | iex
```

## What's built in

Teaching and curriculum:

- CCSS, NGSS, digital literacy standards, and standards from all 50 U.S. states
- Ebook and PDF readers
- A drawing canvas
- Advanced math and graphing, backed by Python
- Flashcards and MCQ tests
- Teaching models: Socratic, project-based learning, case studies, and more
- Resource design and creation: assessments, practice sets, revision sets, DOCX, slides, sheets
- Learning frameworks: Bloom's Taxonomy, DOK, Gagné's model, formative assessment, SOLO, GRR

Agent capabilities:

- Subagents, skills, and custom tools
- MCP servers
- Agent files
- ChatGPT login, GitHub Copilot login, BYOK, and 50+ other providers

## Licensing

Two licenses apply, and the split matters.

Buddy's own code is under the [O'Saasy License](LICENSE). It grants what MIT grants, including commercial use, modification, and redistribution, with one restriction: you may not offer Buddy to third parties as a hosted or managed service that competes with the original author.

That restriction means **Buddy is not open source** under the OSI definition, which does not allow limits on field of use. Source-available is the accurate term. Read the license rather than relying on a label.

Everything under `vendor/opencode/` is MIT, and stays MIT. Its license is at `vendor/opencode/LICENSE`.

Third-party code, data, models, fonts, and other assets retain their own
licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution
and source details.

## Contributing

Issues and pull requests are open, with no promises attached. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks a PR has to pass, and the rule about not patching `vendor/`.

Found a security problem? [SECURITY.md](SECURITY.md) has the private reporting route. Please don't file it as a public issue.

By participating you agree to the [code of conduct](CODE_OF_CONDUCT.md).
