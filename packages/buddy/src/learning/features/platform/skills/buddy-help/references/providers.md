---
name: providers
description: "Buddy AI providers: ChatGPT OAuth, API keys, free models, model pick, usage."
---

# Providers

Buddy has no Buddy account. Chat still needs an AI provider: ChatGPT login, API keys, env credentials, or free models.

## Paths

| Goal | Where |
| --- | --- |
| Connect / disconnect | **Settings → AI Providers** |
| First launch engine | Onboarding: **Connect ChatGPT** or **Free models** |
| Model for this chat | Composer model control, or `/model` |
| Thinking | Composer toolbar (when the selected model offers variants) |

## Connect

**Settings → AI Providers** sections: **Connected**, **Recommended**, **All providers** (search when the catalog is large). **Needs attention** appears when a connection needs repair.

**Recommended** promotes ChatGPT. Other providers are under **All providers**.

- **ChatGPT** — Connect opens the system browser. Finish sign-in there; Buddy returns you to the app when done. Prefer this for ChatGPT Plus/Pro-style accounts.
- **Other providers** — **Connect** / **Edit connection**: paste **API key**, or complete OAuth (auto wait, or paste code).
- **Disconnect** — Edit connection → Disconnect (not available when configured via environment variables; change the env var outside Buddy).
- After connect/disconnect, models refresh for open notebooks.

Onboarding: **Connect ChatGPT** → OpenAI-style connection; **Free models** → free hosted models (can work without saving a key).

## Models

- Picker shows models for **connected** providers (and free zero-cost models when available).
- ChatGPT OAuth may **filter** models to what the account allows.
- Selection is per notebook/chat on this machine. Opening a chat can restore its last model.
- Image/sketch needs a model that accepts images; the composer warns when the selected model cannot accept them.

There is no Settings “Model” tab — pick models in chat. Memory has its own model controls (`learner-memory.md`).

## ChatGPT usage (Settings)

When ChatGPT OAuth is connected, its card can show account, plan, and usage windows. **Refresh** reloads usage. Context usage is also available from the composer.

Usage can fail to load while chat still works. Buddy does not show the same usage UI for generic API-key providers.

## Honesty

- “No Buddy login” ≠ no provider login. Keys and OAuth tokens stay **on this machine** for local use — not a Buddy cloud account.
- Do not invent provider names or model names not in the user’s catalog.
- Tell the **user** Settings → AI Providers; model switch is user UI.
- Marketing “many providers / local models” means: if it appears under **All providers** with a connect method, connect it. Do not invent Ollama steps.

## Gotchas

- **ChatGPT browser sign-in** needs the browser and Buddy to finish the handoff. Firewall/browser blocks can stall “Waiting for browser…”.
- **Env-managed** connection: read-only in Buddy; remove or change the env var outside Buddy.
- Free hosted models can hit network rate limits — retry later or switch model.
- Generic stream failure — try again or switch models.
- Cancel during OAuth may leave a half-finished wait; reconnect from Settings.

## Related

- `setup.md` — onboarding engine pick
- `trust.md` — local data vs provider login
- `settings.md` — Settings tabs
- `chat.md` — composer / slash
