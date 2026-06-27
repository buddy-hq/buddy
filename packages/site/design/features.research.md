# Features — What Products Show vs. What They Omit

> Research exercise: catalog the full feature set of each analyzed product, identify what makes the landing page and what doesn't, and understand why. No pattern-finding — just the raw inventory and the omission logic.
>
> Source: landing page research files in `research/`, product websites, docs, and changelogs. Data collected Jun 2026.

---

## Linear

### Full feature inventory

**Planning:** Projects, initiatives, strategic roadmaps, PRDs, visual planning, documents, project Slack channels
**Building:** Issue tracking, cycle planning, git automations, sub-teams, multi-level sub-teams
**AI:** Linear Agent, Triage Intelligence, Coding Sessions (agent writes code via Claude Code/Codex), Code Intelligence, Linear MCP, shared skills for Linear Agent, agent-assisted project updates
**Insights:** Pulse (weekly updates), analytics, dashboards, release pipeline changelogs
**Intake:** Customer Requests, Linear Asks, Slack/Teams integration, Linear Asks Agent
**Review:** Linear Diffs (structural code diffs), Review Inbox, guided reviews, file-level navigation
**Releases:** Release pipelines, deployment tracking (CI/CD integration), auto-generated release notes
**Platform:** Mobile (iOS/Android), desktop app (macOS/Windows), integrations (100+), OAuth app manifests, desktop navigation history, pinned tabs
**Security:** SSO/SAML, SCIM, audit logs, data encryption, private sub-teams
**Other:** Team documents, custom coding tool integrations, Vercel Eve agent building, GitHub Enterprise Cloud integration, issue duplicates, coding sessions in cloud

### What the landing page shows (5 chapters)

1. **Intake** — Triage, Customer Requests, Linear Asks, Linear Agent (4 sub-features)
2. **Plan** — Projects, Documents, Initiatives, Visual planning (4 sub-features)
3. **Build** — Issues, Agents, Linear MCP, Git automations, Cycles (5 sub-features)
4. **Diffs** — Structural code review (standalone)
5. **Monitor** — Pulse, Insights, Dashboards (3 sub-features)

### What is OMITTED and why

- **Mobile (iOS/Android)** — Full apps, not on landing page. The landing page targets product teams at their desks. Mobile is a companion, not the core story. Showing it would dilute the "serious tool for serious work" positioning.
- **Security (SSO, SAML, audit logs, encryption)** — On a separate `/security` route. Security is table stakes for enterprise. Putting it on the landing page shifts the tone from "productivity" to "compliance." Enterprise buyers check it separately.
- **Coding Sessions** — Agent can write code via Claude Code and Codex. Only in the changelog strip, not a feature chapter. It's brand new (Jun 2026). Linear's core identity is planning + tracking, not code execution. Adding it as a chapter would muddy the "product development system" positioning. It's mentioned as momentum, not as identity.
- **Releases (pipeline tracking, CI/CD, auto release notes)** — Not on the landing page. It's a feature for teams already deep in Linear's workflow. The landing page is for getting people in the door. Release tracking is an advanced workflow concern.
- **Integrations (100+)** — Not on the landing page as a feature. Integrations are expected, not differentiating. The Slack integration appears within the Intake chapter's mockup, but "100+ integrations" isn't a headline.
- **Team documents** — Not on the landing page. It's a utility feature, not a workflow step. It supports the workflow but isn't the workflow.
- **Private sub-teams** — Not on the landing page. Org structure feature, not a product workflow. Relevant to admins, not to the buyer evaluating the product.
- **OAuth app manifests** — Not on the landing page. Developer infrastructure, not a product feature.
- **Vercel Eve agent building** — Not on the landing page. Too niche, too new, too technical for the landing page audience.
- **GitHub Enterprise Cloud integration** — Not on the landing page. Enterprise-specific, not part of the core workflow story.
- **Issue duplicates, reorder groups** — Not on the landing page. Utility features, not story-worthy.
- **Desktop navigation history, pinned tabs** — Not on the landing page. App UX details, not product features.

### Omission principle

Linear shows the **workflow lifecycle** (Intake → Plan → Build → Diffs → Monitor). Everything that IS the workflow gets a chapter. Everything that SUPPORTS the workflow (security, mobile, integrations, releases) or is too new/niche (coding sessions, team docs, sub-teams) gets omitted or relegated to sub-features, changelog, or separate routes.

---

## Cursor

### Full feature inventory

**Interaction modes:** Agent mode (autonomous multi-file), Ask mode (conversational, no edits), Manual mode (inline edits), Tab autocomplete (Supermaven-powered), Inline chat (Cmd+K)
**Agents:** Background agents (cloud, async, push PRs), Cloud agents (isolated VMs, parallel up to 8, terminal+browser+desktop access), Parallel agents (git worktrees, `/multitask`), `/best-of-n` (multi-model comparison), Agents Window (full-screen agent management)
**Code intelligence:** Semantic codebase indexing, `@codebase` search, `@file`/`@folder` references, `@web` search, `@docs` references
**Review:** Bugbot (automated PR review, 80% resolution rate, can spin up its own cloud agent to fix bugs), `/review` pre-push, Security Review
**Design:** Design Mode (visual prompting for UI, Cmd+Shift+D)
**Models:** Model picker (Claude, GPT, Gemini, DeepSeek, Cursor's own Composer model), per-interaction-type model selection, custom fine-tuned models
**Customization:** `.cursorrules` file (persistent instructions), custom context providers, per-project rules
**Platform:** Desktop IDE (macOS/Windows/Linux), JetBrains plugin, iOS app, Android app, headless CLI, VS Code extension ecosystem (Prettier, ESLint, Docker, GitLens, language servers)
**Team:** Team workflows, admin controls, usage dashboards, credit-based billing management
**Other:** Composer 2 (proprietary model), git tooling, worktree management, Design Mode v2

### What the landing page shows (4 demo cards + 1 capabilities cluster)

1. **Agents** — Turn ideas into code (agent mode demo)
2. **Cloud agents** — Works autonomously, runs in parallel (cloud agent demo)
3. **Everywhere** — In every tool, at every step (terminal, Slack, GitHub)
4. **Tab** — Magically accurate autocomplete (Tab demo)
5. **Stay on the frontier** — Model picker, codebase indexing, enterprise (capabilities cluster, not a demo card)

### What is OMITTED and why

- **Ask mode and Manual mode** — Two of three interaction modes, not on the landing page. Agent mode is the headline. Ask and Manual are alternatives for users who want less autonomy, but they're not the differentiator. Showing all three would dilute the "agents" message.
- **Inline chat (Cmd+K)** — Not on the landing page. It's a power-user shortcut, not a headline feature. Users discover it after installing.
- **Bugbot** — Automated PR review with 80% resolution rate. Not on the landing page. It's a complementary tool, not the core IDE experience. It lives in docs and changelog.
- **Design Mode** — Visual prompting for UI work. Not on the landing page. It's a specialized feature for frontend developers. Too niche for the general landing page audience.
- **`.cursorrules` / custom rules** — Not on the landing page. It's a configuration feature for power users. The concept of "instructions" is absorbed into the agent narrative.
- **Context providers (`@web`, `@docs`, `@file`, `@folder`)** — Not on the landing page as a feature. `@codebase` is mentioned within the "Stay on the frontier" cluster. The rest are power-user references discovered in docs.
- **JetBrains plugin** — Not on the landing page. It's an alternative entry point for JetBrains users, not the core story (which is the standalone IDE).
- **iOS/Android apps** — Not on the landing page. Companion apps, not the primary experience.
- **Headless CLI** — Not on the landing page. Developer tooling, not a product feature for the landing page audience.
- **VS Code extension ecosystem** — Not on the landing page. Expected, not differentiating. Users know VS Code extensions work because Cursor is a VS Code fork.
- **Team workflows, admin controls, usage dashboards** — Not on the landing page. Team features matter after individual adoption.
- **Composer 2 (proprietary model)** — Not on the landing page as a feature. It's mentioned in the model picker within "Stay on the frontier" but not called out separately.
- **`/multitask`, `/best-of-n`, worktree management** — Not on the landing page. Power-user commands, not headline features.
- **Security Review** — Not on the landing page. Enterprise feature, discovered separately.
- **Credit-based billing management** — Not on the landing page. Admin concern, not a product feature.

### Omission principle

Cursor shows **surfaces of the agent** (in-IDE, cloud, everywhere, tab). Everything that IS a way you encounter the agent gets a demo card. Everything that's a mode within a surface (Ask, Manual, Inline chat), a complementary tool (Bugbot, Design Mode), a power-user feature (rules, context providers, `/multitask`), or a platform detail (JetBrains, mobile, CLI) gets omitted.

---

## Raycast

### Full feature inventory

**Launcher:** Root search (apps, files, folders), command search, fallback commands, hotkeys, aliases, quicklinks (with tagging/pinning), calculator (with color conversion, syntax highlighting, inline translation, flight tracker), emoji picker (multiple grid options)
**AI:** AI Chat (branching chats, memory, skills, agents/presets, danger mode, auto-archive, `/`-commands), Quick AI (redesigned, fallback command), AI Commands (custom, output behavior, tool calls with rich detail), AI Extensions (`@`-mention apps/services), dictation (transcription styles, context-aware), dozens of models (GPT-5 family, Claude, Gemini, DeepSeek, o3/o4, GPT-OSS), BYOK (custom API keys), local models (Ollama, vision support, tool calling), MCP support
**Productivity:** Snippets (multiline, tagging, dynamic placeholders including `{calculator}`), Clipboard History (unlimited, rename, group, all representations), Window Management (custom commands, layouts), Raycast Notes (unlimited), Raycast Focus (start/pause/resume/complete sessions, categories), Calendar (create event), Translator (custom commands, output behavior)
**Extensions:** Extension store (thousands of extensions), community extensions, built-in extensions (Linear, Slack, Notion, 1Password, JIRA, Zoom, Spotify, Arc, etc.)
**Platform:** Cloud Sync (full sync across Macs), custom themes (community + custom), Pro features
**Teams:** Shared snippets, shared AI commands, team drive, webhooks
**Other:** Auto-quit, affiliate program, referral program, share feedback command

### What the landing page shows (~6 major sections)

1. **Extensions showcase** — 17 extension cards as the core pitch
2. **AI** — Chat, Quick AI, AI Commands
3. **Automation** — Snippets, Quicklinks, Clipboard History
4. **Breadth carousel** — "Kitchen sink" of features
5. **Community wall** — 24 avatars
6. **Developer/Extensibility** — Build your own extensions

### What is OMITTED and why

- **Calculator (with color conversion, flight tracker, syntax highlighting)** — Not on the landing page. It's a utility, not a headline feature. Users discover it in the launcher.
- **Emoji picker** — Not on the landing page. It's a minor utility.
- **Calendar** — Not on the landing page. It's a basic integration, not a differentiator.
- **Translator** — Not on the landing page. It's a utility feature.
- **File search (new indexing engine)** — Not on the landing page. It's a launcher capability, expected not differentiating.
- **Clipboard History (unlimited, rename, group)** — Shown as part of "automation" but the details (rename, group, all representations) are omitted. The concept gets shown; the implementation details don't.
- **Window Management** — Not on the landing page. It's a utility, not a story-worthy feature.
- **Raycast Notes** — Not on the landing page. It's a companion feature, not a headline.
- **Raycast Focus** — Not on the landing page. It's a new feature (focus sessions, category blocking). Too new, too niche for the landing page.
- **Dictation** — Not on the landing page. It's a new feature (transcription styles, context-aware). Lives in the changelog.
- **BYOK / custom API keys** — Not on the landing page. Mentioned on the Pro page. BYOK is a separate concern from "what can I do with this?"
- **Local models (Ollama)** — Not on the landing page. Lives in changelog and Pro page. Too technical for the landing page audience.
- **Cloud Sync** — Not on the landing page. It's a Pro feature, mentioned on the Pro page.
- **Custom themes** — Not on the landing page. It's a Pro feature, mentioned on the Pro page.
- **Teams (shared snippets, shared AI commands, webhooks)** — Not on the landing page. Team features matter after individual adoption.
- **Auto-quit** — Not on the landing page. It's a setting, not a feature.
- **Affiliate/referral program** — Not on the landing page. Business infrastructure.
- **Danger mode (bypasses confirmation prompts)** — Not on the landing page. Power-user setting.
- **AI Chat details (memory, skills, agents/presets, auto-archive, `/`-commands)** — Not on the landing page. These are power-user features within AI Chat. The landing page shows "AI Chat exists" not "here are 8 sub-features of AI Chat."
- **MCP support** — Not on the landing page. Too technical for the landing page audience.
- **AI Extensions (`@`-mention)** — Not on the landing page. Too technical/niche for the landing page audience.

### Omission principle

Raycast shows the **ecosystem pitch** (extensions, AI, automation, community, developers). The extension store IS the product — everything else supports it. Utilities (calculator, emoji, window management, notes, focus, dictation), Pro features (sync, themes, BYOK, local models), team features, and power-user settings (danger mode, AI Chat sub-features, MCP) are all omitted. The landing page sells the concept; the details live in Pro page, changelog, and docs.

---

## Dia Browser

### Full feature inventory

**AI:** Morning Brief (daily summary), Proactive Suggestions (contextual recommendations during browsing), Ask Dia (natural language answers), Dia Actions (perform tasks across tabs)
**Browser surfaces:** Split views, organized tabs, tab profiles (swipeable), Live Work (real-time collaboration), Reports (ready-to-share outputs), Better Meetings (meeting prep/notes)
**Search:** Arc Search-inspired features (coming to mobile 2026)
**Platform:** Desktop (macOS, Windows), mobile (iOS, coming 2026)
**Privacy:** Block trackers, personalize new chats toggle, memory toggle, block ads, share content data toggle
**Other:** Arc's "greatest hits" features being added (swipeable profiles, Arc Search updates)

### What the landing page shows (3 narrative steps + 6 feature cards + privacy)

1. **Start your day two steps ahead** — Morning Brief
2. **You focus, Dia suggests** — Proactive Suggestions
3. **Find the answer without hunting it down** — Ask Dia
4. **6 feature cards:** Reports, Live Work, Better Meetings, Profiles, Splits, Organized Tabs
5. **Privacy section** — Toggle switches for control

### What is OMITTED and why

- **Dia Actions** — Not clearly called out as a separate feature on the landing page. It's absorbed into the Ask Dia narrative.
- **Arc Search / mobile search** — Not on the landing page. It's a coming-soon feature for mobile. Too speculative.
- **Mobile app (iOS)** — Not on the landing page. It's coming in 2026. The landing page sells the desktop experience.
- **Swipeable profiles** — Mentioned as a coming feature, not a landing page feature. Too new.
- **Arc's "greatest hits" features** — Being added incrementally. Not on the landing page because they're in flux.
- **Windows support** — Not highlighted as a feature. Platform support is expected, not a differentiator for a browser.

### Omission principle

Dia shows the **daily workflow** (morning, during work, on-demand) plus **browser surfaces** (the 6 cards) plus **privacy**. Everything that's coming soon (mobile, Arc Search, swipeable profiles), too new (Dia Actions as a separate concept), or platform-level (Windows) is omitted. Dia is the most minimal page — it shows the least because it has the clearest story.

---

## Hermes Agent

### Full feature inventory

**Core:** Tools & Toolsets (60+ built-in tools, per-platform enable/disable), Skills System (on-demand knowledge documents, agentskills.io compatible, progressive disclosure), Persistent Memory (MEMORY.md, USER.md, bounded/curated, cross-session), Context Files (.hermes.md, AGENTS.md, CLAUDE.md, SOUL.md, .cursorrules — auto-discovery), Context References (@ files/folders/git diffs/URLs), Checkpoints (auto-snapshot, /rollback)
**Automation:** Scheduled Tasks (cron, natural language, platform delivery, pause/resume/edit), Subagent Delegation (delegate_task, isolated context, restricted toolsets, 3 concurrent default), Code Execution (execute_code, Python RPC, sandboxed), Event Hooks (gateway hooks, plugin hooks), Batch Processing (hundreds/thousands of prompts, ShareGPT trajectory data)
**Media & Web:** Voice Mode (full voice interaction, CLI + messaging, Discord voice channels), Browser Automation (Browserbase, Browser Use, local Chrome/Brave/Chromium/Edge, CDP), Vision & Image Paste (multimodal, clipboard paste), Image Generation (FAL.ai, 9 models: FLUX, GPT-Image, Nano Banana, Ideogram, Recraft, Qwen, Z-Image), Voice & TTS (10 providers: Edge TTS, ElevenLabs, OpenAI, MiniMax, Mistral, Google, xAI, NeuTTS, KittenTTS, Piper)
**Integrations:** MCP Integration (stdio/HTTP, per-server tool filtering, sampling), Provider Routing (cost/speed/quality optimization, whitelists, blacklists, priority), Fallback Providers (auto-failover, independent fallback for auxiliary tasks), Credential Pools (multi-key rotation, rate limit handling), Prompt Caching (1-hour prefix cache, always-on), Memory Providers (Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory), API Server (OpenAI-compatible HTTP endpoint), IDE Integration (ACP — VS Code, Zed, JetBrains), Batch Processing (parallel, structured outputs, trajectory capture)
**Customization:** Personality & SOUL.md (customizable identity, /personality presets), Skins & Themes (banner colors, spinner, labels, branding), Plugins (tools/hooks, memory providers, context engines, unified UI)
**Platform:** 20+ messaging platforms (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email, SMS, DingTalk, Feishu, WeCom, Weixin, QQ Bot, Yuanbao, BlueBubbles, Home Assistant, Microsoft Teams, Google Chat), 6 terminal backends (local, Docker, SSH, Singularity, Modal, Daytona), desktop app (macOS, Windows)
**Other:** Kanban board (multi-agent, heartbeat, reclaim, zombie detection, auto-block, retries, hallucination recovery), `/goal` (Ralph loop, target locking), checkpoints v2 (state persistence, pruning), gateway auto-resume, `no_agent` watchdog mode, security (redaction ON by default, Discord role-allowlists, WhatsApp stranger rejection, TOCTOU fixes), providers as plugins, 7 i18n locales, SearXNG search, split web tools, dashboard (plugins page, profiles, analytics tables, reverse-proxy), research-ready (batch trajectory, Atropos RL training)

### What the landing page shows (6 numbered steps)

1. **Connect** — Lives Everywhere (20+ platforms)
2. **Remember** — Persistent Memory
3. **Schedule** — Focused Automation (cron)
4. **Delegate** — Tasks Multiplied (subagents)
5. **Search** — Browse the Web (web search, browser automation, vision, image gen, TTS)
6. **Experiment** — Isolated Sandboxing (5 backends)

### What is OMITTED and why

- **Skills System** — Not on the landing page. It's a core feature (on-demand knowledge, agentskills.io compatible) but it's too abstract for a 6-step landing page. Users discover it in docs. The concept of "the agent learns" is absorbed into "Remember."
- **Context Files (.hermes.md, AGENTS.md, CLAUDE.md, SOUL.md, .cursorrules)** — Not on the landing page. Developer configuration, not a user-facing feature.
- **Context References (@ files/folders/URLs)** — Not on the landing page. Power-user interaction pattern.
- **Checkpoints (/rollback)** — Not on the landing page. Safety feature, not a headline capability. Expected, not differentiating.
- **Code Execution (execute_code, Python RPC)** — Not on the landing page. Too technical. The concept of "the agent can run code" is absorbed into "Experiment" (sandboxing).
- **Event Hooks** — Not on the landing page. Developer infrastructure.
- **Batch Processing** — Not on the landing page. Research/eval feature, not a daily-use capability.
- **Voice Mode** — Not on the landing page. Despite being a rich feature (full voice interaction, Discord voice channels), it's omitted. Why: voice is a modality, not a capability. The landing page shows what the agent DOES, not how you talk to it.
- **Vision & Image Paste** — Not on the landing page. Absorbed into "Search" (which mentions vision).
- **Image Generation** — Not on the landing page. Absorbed into "Search" (which mentions image generation).
- **Voice & TTS (10 providers)** — Not on the landing page. Absorbed into "Search" (which mentions TTS). The 10-provider detail is in docs.
- **MCP Integration** — Not on the landing page. Too technical for the landing page audience.
- **Provider Routing** — Not on the landing page. Power-user configuration.
- **Fallback Providers** — Not on the landing page. Reliability infrastructure.
- **Credential Pools** — Not on the landing page. API management detail.
- **Prompt Caching** — Not on the landing page. Performance optimization, not a user-facing feature.
- **Memory Providers (8 external backends)** — Not on the landing page. Advanced configuration.
- **API Server (OpenAI-compatible endpoint)** — Not on the landing page. Developer infrastructure.
- **IDE Integration (ACP)** — Not on the landing page. Developer tooling.
- **Personality & SOUL.md** — Not on the landing page. Customization detail, not a headline capability.
- **Skins & Themes** — Not on the landing page. Cosmetic.
- **Plugins** — Not on the landing page. Extensibility infrastructure.
- **Kanban board** — Not on the landing page. Too new (v0.13.0), too niche.
- **`/goal` (Ralph loop)** — Not on the landing page. Power-user command.
- **Security details (redaction, role-allowlists, stranger rejection)** — Not on the landing page. Expected, not differentiating.
- **Dashboard** — Not on the landing page. Management UI, not a capability.
- **Research-ready (Atropos RL training)** — Not on the landing page. Niche research use case.
- **i18n (7 locales)** — Not on the landing page. Platform feature, not a capability.
- **SearXNG, split web tools** — Not on the landing page. Implementation detail within "Search."

### Omission principle

Hermes shows **verb-first capabilities** (Connect, Remember, Schedule, Delegate, Search, Experiment). Each step is a thing the agent CAN DO, framed as a user action. Everything that's a modality (voice), a configuration (context files, personality, skins), infrastructure (MCP, API server, IDE integration, plugins, hooks, batch), a reliability feature (checkpoints, fallback, credential pools, prompt caching), or too niche/new (Kanban, `/goal`, research-ready, i18n) is omitted. The landing page shows 6 of ~40+ features. The 6 chosen are the ones that answer "what can this agent do for me?"

---

## OpenCode

### Full feature inventory

**Agent:** Multi-file editing, terminal command execution, code search, autonomous task completion, error recovery and iteration
**Models:** BYOK (Copilot, ChatGPT/Plus/Pro, any provider), Zen (curated model set, validated for coding), local models (Ollama, LM Studio), model switching
**Platform:** Terminal (macOS, Linux, Windows), desktop app, IDE integration, headless
**Session management:** Git-based snapshots before changes, `/undo` and `/rollback`, multi-session, session sharing (share links), session persistence
**Context:** LSP integration, codebase awareness, file context
**Privacy:** No data storage, privacy-sensitive environments, local-first
**Other:** OAuth authentication (historical — blocked by Anthropic Jan 2026), open source

### What the landing page shows (flat list in "What is OpenCode?")

1. BYOK — Copilot, ChatGPT, any model
2. Terminal + desktop + IDE
3. LSP integration
4. Multi-session
5. Share links
6. Privacy (no data stored)
7. Zen (curated models)

### What is OMITTED and why

- **Error recovery and iteration** — Not on the landing page. It's a behavior, not a feature. Users experience it but it's not marketable as a bullet point.
- **Code search** — Not on the landing page. Expected capability, not differentiating.
- **`/undo` and `/rollback`** — Not on the landing page. Power-user commands.
- **Git-based snapshots** — Not on the landing page. Implementation detail of session management.
- **Session persistence** — Not on the landing page. Absorbed into "multi-session."
- **Local models (Ollama, LM Studio)** — Not on the landing page as a separate bullet. Absorbed into "any model" in the BYOK bullet.
- **Model switching** — Not on the landing page. Absorbed into BYOK.
- **OAuth authentication controversy** — Not on the landing page. It's a historical issue (Anthropic blocked OpenCode's OAuth Jan 2026). Not relevant to new users.
- **Open source** — Mentioned but not as a feature bullet. It's in the GitHub stars social proof, not the feature list.

### Omission principle

OpenCode shows a **flat list of "what is it?"** — BYOK, platform, LSP, multi-session, share links, privacy, Zen. Everything that's a behavior (error recovery, code search), a power-user command (`/undo`, `/rollback`), an implementation detail (git snapshots, session persistence), or a historical issue (OAuth) is omitted. The list is dense because the section does multiple jobs (BYOK + platform + capabilities + privacy), but it's still curated — 7 items from ~15+ total features.

---

## Pi

### Full feature inventory

**Agent core:** Agent loop with tool calling and state management, read/bash/edit/write tools, session management
**Models:** Unified multi-provider LLM API (OpenAI, Anthropic, Google, and 15+ more), per-provider tool-capable model lists, model registry
**Session:** Tree-structured history, shareable sessions, session branching
**Context:** Context engineering (managed context window), extensions (load dynamically when relevant), skills (custom instructions for tasks)
**Control:** Plan mode, permission gates, SSH, sandboxing, custom editors
**Platform:** CLI (terminal), TUI (terminal user interface)
**Extensibility:** Extensions, sub-agents (via tmux or custom), MCP (via extensions or custom), custom editors
**Other:** Headless mode, coding agent CLI, agent core package, AI package (unified API)

### What the landing page shows (9 sections, interactive)

1. **Why Pi?** — Positioning
2. **Change the harness, not your workflow** — Extensibility
3. **15+ providers, hundreds of models** — Provider support
4. **Tree-structured, shareable history** — Session management
5. **Context engineering** — Managed context
6. **Steer** — Directing the in-flight agent
7. **Modes** — Plan mode, permission gates
8. **Primitives, not features** — Extensions, sub-agents, plan mode, permission gates, SSH, sandboxing, MCP, custom editors
9. **What we didn't build** — No MCP, No sub-agents, No plan mode, No permission popups, No built-in to-dos, No background bash

### What is OMITTED and why

- **Agent core (tool calling, state management)** — Not on the landing page as a feature. It's the engine, not the product. Users don't care about "tool calling and state management" — they care about what it enables (steer, modes, extensions).
- **read/bash/edit/write tools** — Not on the landing page. These are the basic tools, expected not differentiating.
- **Model registry** — Not on the landing page. Implementation detail of provider support.
- **Per-provider tool-capable model lists** — Not on the landing page. Implementation detail.
- **Session branching** — Not on the landing page as a separate feature. Absorbed into "tree-structured history."
- **Headless mode** — Not on the landing page. Developer infrastructure.
- **Coding agent CLI / agent core / AI package** — Not on the landing page as features. These are npm packages, not user-facing features. The landing page is about the experience, not the package structure.
- **TUI (terminal user interface)** — Not on the landing page as a feature. It's the interface, not a capability. The interactive landing page IS the demo of the TUI.

### Omission principle

Pi shows the **philosophy and control model** (why Pi, extensibility, providers, history, context, steer, modes, primitives, what we didn't build). Everything that's engine-level (agent core, tool calling, state management, model registry), basic (read/bash/edit/write tools), infrastructure (headless mode, npm packages), or interface (TUI) is omitted. Pi is the outlier — it shows 9 sections, more than anyone else, because its landing page is an interactive deep dive. But even Pi omits the engine and infrastructure.

---

## Warp

### Full feature inventory

**Agent:** Agent Mode (natural language → terminal commands), Warp Agents (orchestrate swarms of subagents, parallelize tasks), MCP support, cloud deployments (launch agents into cloud from any surface)
**AI:** AI Command Suggestions (natural language → commands), Chat with Warp AI (walk through workflows), AI autofill in Warp Drive, Prompt Suggestions (contextual, activate Agent Mode), Next Command (AI-generated command suggestions based on session/history)
**Warp Drive:** Workflows (parameterized commands for reuse), Notebooks (interactive runbooks in terminal), Personal Drive (cloud library), Environment Variables (save/sync), Warp Drive on the Web, Team Drive (shared notebooks/workflows)
**Editing:** IDE-like editing, Blocks (input/output blocks), Vim keybindings, Completions, Command corrections
**Appearance:** Custom prompt, Custom themes, Input position, Transparent background
**Collaboration:** Session Sharing, Block Sharing (permalinks)
**Usability:** Command Palette, Command Search, Rich History (exit codes, directory details, branches, timestamps), Markdown Viewer, Launch Configurations (windows/panes/commands)
**Privacy & Security:** Secret Redaction, SSO/SAML, Disable telemetry, Zero data retention policy, Disable Active AI
**Integrations:** Launch from Raycast/Alfred, Open VSCode/Zed/Cursor, Docker extensions
**Terminal basics:** Backwards compatible, Platform support (macOS, Linux, Windows)
**Enterprise:** Full control, Secure by design

### What the landing page shows (tabbed product showcase + download)

1. **Agent Mode** — Natural language to terminal
2. **Warp Agents** — Subagent swarms, parallel tasks
3. **Cloud Deployments** — Launch agents to cloud
4. **MCP support** — Connect external tools
5. **Warp Drive** — Workflows, Notebooks, sharing
6. **AI features** — Command suggestions, chat, autofill, prompt suggestions, next command
7. **Download section** — All platforms + package formats

### What is OMITTED and why

- **IDE-like editing** — Not on the landing page. It's a baseline capability, not a differentiator. Expected in a modern terminal.
- **Blocks (input/output blocks)** — Not on the landing page. It's a UX paradigm, not a feature you market.
- **Vim keybindings** — Not on the landing page. Niche preference, not a headline.
- **Completions** — Not on the landing page. Expected terminal feature.
- **Command corrections** — Not on the landing page. Absorbed into AI features.
- **Custom prompt** — Not on the landing page. Cosmetic.
- **Custom themes** — Not on the landing page. Cosmetic.
- **Input position** — Not on the landing page. Setting, not feature.
- **Transparent background** — Not on the landing page. Cosmetic.
- **Command Palette** — Not on the landing page. Expected in modern apps.
- **Command Search** — Not on the landing page. Expected.
- **Rich History** — Not on the landing page. Utility feature.
- **Markdown Viewer** — Not on the landing page. Utility feature.
- **Launch Configurations** — Not on the landing page. Power-user feature.
- **Environment Variables** — Not on the landing page. Utility feature.
- **Warp Drive on the Web** — Not on the landing page. Companion feature.
- **Session Sharing** — Not on the landing page. Team feature.
- **Block Sharing** — Not on the landing page. Team feature.
- **Secret Redaction** — Not on the landing page. Security feature, in a separate privacy section.
- **SSO/SAML** — Not on the landing page. Enterprise feature.
- **Disable telemetry** — Not on the landing page. Privacy setting.
- **Zero data retention** — Not on the landing page. Enterprise compliance.
- **Disable Active AI** — Not on the landing page. Privacy setting.
- **Launch from Raycast/Alfred** — Not on the landing page. Integration detail.
- **Open VSCode/Zed/Cursor** — Not on the landing page. Integration detail.
- **Docker extensions** — Not on the landing page. Integration detail.
- **Backwards compatible** — Not on the landing page. Expected.
- **Enterprise (full control, secure by design)** — Not on the landing page as a feature. Enterprise buyers check separately.

### Omission principle

Warp shows **agentic capabilities** (Agent Mode, Warp Agents, Cloud, MCP) + **AI features** + **Warp Drive** + **download**. Everything that's a terminal basic (editing, blocks, Vim, completions), cosmetic (themes, prompt, transparency), utility (command palette, search, history, markdown viewer, launch configs, env vars), team (session/block sharing, team drive), security (redaction, SSO, telemetry, retention), or integration (Raycast, Alfred, VSCode, Docker) is omitted. The landing page sells "this is an agentic environment" not "this is a good terminal."

---

## Cross-Product Summary: What Gets Omitted

### 1. Platform/infrastructure features
Mobile apps, desktop apps, platform support, integrations, extensions ecosystem, CLI, headless mode, backwards compatibility.

**Why:** These are expected or companion features. They make the product better but don't define why you'd download it. Showing them dilutes the narrative.

### 2. Security/compliance features
SSO, SAML, audit logs, encryption, secret redaction, zero data retention, disable telemetry.

**Why:** Security is table stakes for enterprise. It's checked separately, not part of the "what can I do with this" story.

### 3. Advanced/niche capabilities
Coding sessions, release pipelines, Bugbot, Design Mode, voice mode, image generation, TTS, batch processing, Kanban, `/goal`, `/multitask`, `/best-of-n`, focus mode, dictation, batch trajectory, RL training.

**Why:** Too technical, too new, or too niche for the landing page audience. These live in docs, changelogs, or Pro pages.

### 4. Collaboration/team features
Team Drive, session sharing, block sharing, project Slack channels, multi-level sub-teams, shared snippets, shared AI commands, admin controls, usage dashboards.

**Why:** Team features matter after individual adoption. The landing page sells the individual experience first.

### 5. Provider/model management
Provider routing, fallback providers, credential pools, prompt caching, memory providers, model registry, local model details, BYOK details.

**Why:** BYOK/provider details answer "how do I power this?" not "what can I do?" Always a separate section.

### 6. Customization/configuration
Personality/SOUL.md, skins/themes, `.cursorrules`, context files, context references, custom themes, input position, transparent background.

**Why:** Configuration is for existing users, not prospects. The landing page sells the default experience.

### 7. Developer infrastructure
API server, IDE integration (ACP), OAuth manifests, plugins system, event hooks, webhooks, affiliate/referral programs.

**Why:** Developer infrastructure is not user-facing. It enables the ecosystem but isn't the ecosystem.

### 8. Utility features
Calculator, emoji picker, calendar, translator, file search, clipboard history details, window management, notes, command palette, command search, rich history, markdown viewer, launch configurations, auto-quit.

**Why:** Utilities are discovered through use, not marketing. They make the product better but aren't the story.

### What consistently MAKES the cut

1. **The core workflow** (what you do with it day-to-day) — always shown, always first
2. **The headline differentiator** (the thing that makes this product different) — always shown
3. **One trust/philosophy signal** — privacy, local-first, or control — shown but usually brief
4. **One ecosystem/extensibility signal** — extensions, MCP, subagents — shown but usually secondary
