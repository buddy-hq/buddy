---
name: basics-of-agents
description: "General agent vocabulary: model, provider, tools, skills, MCP, subagents, session, context, trust; bridge to Buddy product refs."
---

# Basics of Agents

## Why this file exists

- Buddy users hit product nouns (skills, MCP, chat, provider, Bench) without agent foundations.
- This file is the **general** agent primer in buddy-help — industry vocabulary, not Buddy menus.
- Goal: teach foundations first, then **relate** each concept to how Buddy uses it (product refs for UI truth).
- Use only when user is a **complete newbie to agents** or asks **fundamental** agent questions.
- Not for pure Buddy how-to (install, Settings path, “where is Bench”) — use product topic-map refs alone.

## How to answer from this file

1. Explain the **general** concept (this file).
2. **Bridge to Buddy** — one short map: foundation noun → Buddy place/behavior.
3. If they need UI steps or honesty defaults, open the matching product ref (second ref OK for the bridge).
4. Never invent Buddy menus from this file alone. Product UI authority = other `references/`.
5. Never restate live tool ids/params (runtime owns that).

## Foundation → Buddy (bridge map)

Use after the general definition. Product detail → listed ref.

| Foundation | In Buddy (concept) | Product ref if they need UI |
| --- | --- | --- |
| agent / host / runtime | Buddy desktop (or web) runs the agent session | `workspace.md` |
| provider / model | Settings → Providers; model on chat toolbar | `providers.md` |
| workspace | notebook ≈ folder user opened | `notebooks.md` |
| session | chat in sidebar | `notebooks.md` |
| compaction | compact / auto-compaction on long chats | `notebooks.md` |
| tools | capabilities Buddy/agent can call (not listed by id here) | product + live tools |
| skills | Skills library; skill packages on demand | `extend.md` |
| MCP | Settings → MCPs; per-notebook on/off | `extend.md` |
| subagent | helper/task cards; nested helper work | `chat.md` |
| instruction layers | Profile + AGENTS.md (global / notebook) | `instructions.md` |
| artifacts | Bench + library rail (Sources, Boards, Creations, Practice, Files) | `workspace.md`, `library.md`, `practice.md` |
| working memory / context | what the model sees this turn; context usage near composer | `notebooks.md`, `chat.md` |
| long-term memory | Memory (opt-in) | `learner-memory.md` |
| local-first + egress | no Buddy account; data on machine; chat still goes to provider | `trust.md`, `providers.md` |
| permissions / approve | permission dock: Allow once / always until restart / Reject | `trust.md` |
| structured mid-run ask | question UI above composer (≠ Practice quiz) | `chat.md` |

## Defaults

- Agent ≠ chatbot: goal + tools + multi-step work, not one reply.
- Host ≠ provider ≠ model.
- Context window = working RAM for this turn; finite tokens.
- Session = durable chat of work; leave and reopen.
- Compaction shrinks *this* session history ≠ long-term memory.
- Skills = procedure; tools/MCP = capability.
- Workspace = folder scope; outside often needs extra consent.
- Local-first product state ≠ offline-only ≠ “nothing leaves machine.”
- No product login ≠ no provider keys/OAuth.
- Permission runtime enforces access; prompts not every action.
- Prefer short standing rules; long procedures in skills / loadable files.

## What is an agent

- Chatbot: message → text.
- Agent: goal → choose actions → observe → continue until done, blocked, or user.
- Test: multi-step tool use toward a goal, not only generate a reply.
- Marketing “agent” fuzzy — prefer the test.
- Workflows = fixed paths; agents = model directs tool use (Anthropic framing).

### Learn more

- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [OpenAI — A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [Google / Kaggle — Introduction to Agents](https://www.kaggle.com/whitepaper-introduction-to-agents)

## Model, runtime, environment

| Piece | Role |
| --- | --- |
| **Model** | reasons; chooses words / tool requests |
| **Runtime (host)** | system instructions; tool exec; permissions; stream |
| **Environment** | what agent can touch |

- Chat box alone ≠ agent stack.
- No environment access → mostly chatbot.
- Building block: augmented LLM (tools, retrieval, memory) in a host harness.

### Learn more

- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (augmented LLM, ACI)
- [OpenAI — A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)

## Providers and models

| Piece | Role |
| --- | --- |
| **Host** | product UI + session |
| **Provider** | hosts model API |
| **Model** | one brain in catalog (speed, vision, cost…) |

- Connect: **API key** or **OAuth**.
- Credentials on disk still = provider account, not “no AI login.”
- Model run: chat + tool context **leave to provider**.
- Pick model for job; rate limits real.

### Learn more

- [OpenAI — How we use your data](https://platform.openai.com/docs/guides/your-data)
- [Anthropic — Is my data used for model training? (commercial / API)](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
- [OpenAI — A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) (model selection)

## Context

Typical window contents:

- system instructions
- tool / skill catalogs (often short)
- conversation history
- tool results
- retrieved notes

- Window = RAM: fast, limited, often cleared between sessions unless saved elsewhere.
- More context ≠ better.
- Prefer curation (**context engineering**) over dump.

### Learn more

- [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

## Sessions

- Session = one durable work chat: messages + tool history + identity.
- Not whole app. Not one message.

| Action | Effect |
| --- | --- |
| **New** | clean slate in context |
| **Continue** | history (or compacted form) still in play |
| **Fork / branch** | copy history to point; new session diverges |

- UI may say chat / conversation — same idea: reopenable multi-turn state.
- Host may own storage; model only sees what is re-fed each turn.

### Learn more

- [OpenAI — Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Agents SDK — Sessions](https://openai.github.io/openai-agents-python/sessions/)
- [Anthropic — Managed Agents (session as object outside the window)](https://www.anthropic.com/engineering/managed-agents)

## Compaction

- Long session fills window → **compact**: summarize / drop noise so work continues.
- Keeps goals/decisions; may lose early detail.
- UI transcript can stay long while model sees compacted view.
- Auto near limit and/or manual compact.
- Compaction ≠ cross-session memory.
- Long work also uses external state (files, handoffs) not only summaries.

### Learn more

- [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

## Tools

1. Runtime lists tools (name, purpose, params).
2. Model may request tool with structured args.
3. Runtime executes (or asks approve).
4. Result → context.

- Tools = hands; model still chooses when/how.
- No tools → training knowledge + pasted text only.
- Never invent tool names/params not in live list (product help rule).
- Tool design = agent-computer interface (ACI); clarity beats clever APIs.

### Learn more

- [Anthropic — Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Appendix: prompt-engineer tools)
- [OpenAI — Function calling](https://platform.openai.com/docs/guides/function-calling)

## Skills

- Skill = folder: `SKILL.md` (+ optional scripts/refs).
- Teaches **how** to do a class of work; does not replace model.

**Progressive disclosure**

1. name + description always (routing)
2. full body when task matches
3. extra files only if needed

- Prefer skills over giant system prompts for procedures.
- May ship runnable code for deterministic steps.
- Complements MCP: skills = procedure; MCP = external capability.

### Learn more

- [Anthropic — Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [agentskills.io](https://agentskills.io/home)

## Instruction layers

| Layer | Job |
| --- | --- |
| runtime system prompt | product identity, safety, tool policy |
| user profile / prefs | name, tone, standing prefs |
| project files | this folder/repo (`AGENTS.md`, `CLAUDE.md`, …) |
| skills | on-demand procedures |
| durable memory | cross-session facts when on |

- Profile ≠ project instructions ≠ memory.
- Prefer short standing rules; long how-to in skills / files.
- Conflicting layers → mushy behavior; keep few clear sources.
- Project files = README-for-agents across coding hosts.

### Learn more

- [AGENTS.md](https://agents.md/)
- [OpenAI Codex — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Anthropic — Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (system prompt altitude)

## MCP

- **Model Context Protocol** = open standard host ↔ external tools/data.
- USB-C for AI apps: one protocol, many servers.

| Role | Meaning |
| --- | --- |
| **Host** | user app |
| **Client** | MCP talker inside host |
| **Server** | exposes tools/resources for a domain |

- Skills teach *how*; MCP often exposes *what*.
- Not a model. Not automatic safety.
- Install only trusted servers.

### Learn more

- [MCP — Intro](https://modelcontextprotocol.io/docs/getting-started/intro)
- [MCP — Architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (MCP as tool ecosystem)

## Subagents

- Subagent = delegated agent run; narrower prompt/tools/model; returns summary/result.
- Use for: context hygiene, specialization, cheaper model, parallel slices.
- Tradeoff: handoff loss; less shared memory; hard to debug if overused.
- Prefer one solid agent + skills before multi-agent fanout.
- Patterns: orchestrator-workers; handoffs; agents-as-tools.

### Learn more

- [Anthropic — Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (orchestrator-workers)
- [OpenAI Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/handoffs/)

## Workspace

- Default scope = **workspace** (project folder / repo / notebook dir).
- Root sets: default file access, project instruction files, often which MCP is on.
- Outside tree → extra permission common.
- Prefer clear desk over whole-disk access.
- Project instruction file lives in workspace; agents load it for that root.

### Learn more

- [AGENTS.md](https://agents.md/)
- [Google Research — Approach for secure AI agents](https://research.google/pubs/an-introduction-to-googles-approach-for-secure-ai-agents/) (limited powers)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (environment feedback, sandboxes)

## Artifacts

- Artifact = self-contained output beside chat: file, preview, canvas, widget, report.
- Iterate on the thing, not only prose.
- Large work → disk; re-read; keep window lean.
- Chat = conversation; artifact = work product.
- Long-horizon harnesses leave files/plans for the next session window.

### Learn more

- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic — Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (just-in-time / filesystem)

## Memory

| Kind | Where |
| --- | --- |
| **Working** | context window |
| **Long-term** | files, product memory store, DBs, prefs |

- “Remembers you” = something durable re-injected; not old RAM kept alive.
- Retrieval: pull relevant snippets only.
- Compaction = this session (§ Compaction).
- Filesystem as memory: write plans/notes; re-read later.

### Learn more

- [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [OpenAI Agents SDK — Sessions](https://openai.github.io/openai-agents-python/sessions/) (short-term session history)

## Local-first and egress

**Local-first:** primary product data (files, settings, sessions) on **this machine**.

Not equal to:

- offline-only
- nothing leaves machine
- no logins of any kind

| Egress | When |
| --- | --- |
| model provider | every inference |
| web search/fetch | those tools run |
| remote MCP | connected |
| app updates | desktop channels |

- No product account still allows provider OAuth/keys.
- Prefer host privacy + provider data policy; never claim “nothing leaves.”

### Learn more

- [Ink & Switch — Local-first software](https://www.inkandswitch.com/essay/local-first/)
- [OpenAI — How we use your data](https://platform.openai.com/docs/guides/your-data)
- [Anthropic — Is my data used for model training? (commercial / API)](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)

## Permissions and runs

**Safeguards**

- Approvals before destructive / external
- Sandboxes: FS / network / shell limits
- Least privilege tools
- Trusted skills + MCP only

- Runtime enforces; prompt text is not a security boundary.
- Most actions may **not** prompt. Never claim “approve every action.”

**Run** = busy until done / blocked / stopped. Not “agent loop” jargon.

| Interrupt | Meaning |
| --- | --- |
| approve / reject | tool gate |
| structured question | mid-run choices |
| stop | abort run |
| steer | more input while busy (if product supports) |

- Human controller; limited powers; observable actions (secure-agent framing).

### Learn more

- [Google Research — Approach for secure AI agents](https://research.google/pubs/an-introduction-to-googles-approach-for-secure-ai-agents/)
- [OpenAI — A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) (guardrails)
- [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (human checkpoints, sandboxes)

## Guardrails (when answering from this ref)

- Foundations here are **general**; always **relate** them to Buddy via the bridge map when the user is in Buddy context.
- Do not leave a newbie with abstract agent theory only — name the Buddy surface for each concept you teach.
- Do not invent product menus/paths from this file; open product refs for UI steps and honesty defaults.
- Do not restate live tool ids/params.
- Honesty: local-first + provider egress; approvals not universal; Memory is not “everything by default” (`learner-memory.md` / `trust.md`).
