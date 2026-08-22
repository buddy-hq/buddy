# LAUNCH-03 — Backend exposure, credentials, OAuth, onboarding, and first response

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L03-C01 — P1 — Standalone server fails open when credentials are absent or incomplete

- **Locations:** `packages/buddy/src/node.ts:13-15`, `packages/buddy/src/node.ts:35-64`, `packages/buddy/src/app.ts:79-94`, `packages/buddy/src/app.ts:117-145`
- **Trigger:** Start the standalone/backend artifact without both `BUDDY_SERVER_USERNAME` and `BUDDY_SERVER_PASSWORD`; risk expands to the LAN when `--hostname` is non-loopback.
- **Expected:** Sensitive routes fail closed when authentication is missing, and non-loopback binding requires an explicit secure configuration.
- **Observed in discovery:** The auth middleware bypasses authentication if either variable is missing, the CLI accepts arbitrary hostnames, and the app applies wildcard CORS to the API.
- **Impact:** Local-machine APIs are exposed without credentials by default; an accidental non-loopback bind exposes them to network peers. The API includes local files, config, provider/auth, agent, and session operations.
- **Verification pending:** Start with zero/one credential variables, test sensitive API responses from allowed and untrusted origins, and test whether non-loopback startup is rejected.
- **First-pass confidence:** High.

### L03-C02 — P1 — Embedded backend death after startup is only logged

- **Locations:** `packages/desktop-electron/src/main/index.ts:301-350`, `packages/desktop-electron/src/main/index.ts:692-734`, `packages/web/src/state/chat-sync.ts:248-342`
- **Trigger:** The utility process exits after initial health succeeds because of a crash, OOM, native failure, or forced termination.
- **Expected:** Buddy supervises/restarts the backend or enters a clear fatal/relaunch state exactly once.
- **Observed in discovery:** Post-ready `terminated` events only write logs. The stored child is not cleared or restarted, and the renderer is not notified. Client reconnect loops continue against a port with no server.
- **Impact:** The app remains open but all backend-backed functionality is permanently dead until the user manually restarts Buddy, with no actionable explanation.
- **Verification pending:** Emit a post-ready termination in a lifecycle harness and observe process state, renderer state, reconnect behavior, and recovery UI.
- **First-pass confidence:** High.
- **Reassessment status:** Open. The hardening supervisor was discarded.
- **Why reopened:** Vendored OpenCode's Electron desktop owns local-sidecar startup, readiness, health observation, and shutdown. The hardening pass added a new Buddy recovery state machine and restart/quit policy instead of following that owner; the vendor currently logs a later sidecar exit rather than implementing this stronger recovery behavior.
- **Later work:** First treat post-ready recovery as an explicit product decision and compare with the current vendor desktop during the next upstream/parity pass. If Buddy intentionally requires stronger recovery, design it as a separate desktop product feature with packaged macOS/Windows failure tests—not as an audit-checkbox hardening wrapper.

### L03-C03 — P1/P2 — Remote Basic-auth secrets are embedded in asset URLs and Bench context

- **Locations:** `packages/web/src/lib/server-client.ts:38-43`, `packages/web/src/lib/resource-url.ts:10-45`, `packages/web/src/components/chat/tools/tool-attachments.tsx:20-55`, `packages/web/src/routes/$directory._bench.file.tsx:180-215`, `packages/web/src/components/bench/bench-context-utils.ts:64-72`, `packages/web/test/resource-url.test.tsx:109-138`
- **Trigger:** Use an authenticated non-embedded/browser server and render or open a Buddy-served asset.
- **Expected:** Credentials remain in request headers or a scoped asset mechanism and never enter user-visible URLs or context records.
- **Observed in discovery:** Client helpers place username/password into URL userinfo. Those URLs are used in DOM attributes, and Bench context can retain the exact credential-bearing URL as a `kind: "url"` reference. A current test explicitly expects the secret-bearing URL form.
- **Impact:** The full API credential may leak through DOM inspection/extensions, copy-link behavior, diagnostics, or context capture and later persistence.
- **Verification pending:** Render a remote asset with a sentinel password, collect DOM and Bench context snapshots, trace persistence/agent delivery, and assert the sentinel is absent while the request remains authenticated.
- **First-pass confidence:** High on URL/DOM/context presence; downstream persistence severity remains to be traced.

### L03-C04 — P1 — OAuth cancellation can still complete and store credentials after the user cancels

- **Locations:** `packages/web/src/routes/onboarding.tsx:588-625`, `packages/web/src/routes/onboarding.tsx:769`, `packages/web/src/components/settings/settings-providers.tsx:578-622`, `packages/web/src/components/settings/settings-providers.tsx:741-784`, `packages/web/src/components/connect-provider-dialog.tsx:186-215`, `packages/web/src/lib/onboarding-flow.ts:140-169`, `packages/buddy/src/routes/provider.ts:313-337`, `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts:565-650`
- **Trigger:** Start ChatGPT OAuth and cancel from onboarding or the dedicated Settings waiting dialog before completing the browser callback; alternatively, start the headless method from the generic provider dialog and cancel while device authorization is pending.
- **Expected:** Cancel ends the matching server-side authorization, stops polling/listeners, and guarantees that the cancelled attempt cannot later mutate provider credentials or runtime state.
- **Observed in discovery:** Onboarding races the connection promise against a UI-only `AbortController`, but never passes the signal into the OAuth helper or calls `cancelProviderOAuth`. The Settings cancel button only dismisses its waiting dialog. Both underlying `completeProviderOAuth` calls keep running and can persist credentials and reload the runtime after a late browser callback. The generic dialog does call the cancel route, but that route only rejects the browser-flow `pendingOAuth`; the headless callback's unbounded polling loop has no cancellation signal or timeout and can likewise finish later and store credentials.
- **Impact:** An explicit user cancellation can still attach an OpenAI account and change available models behind the user's back. Abandoned headless attempts can also poll indefinitely, outlive the UI that launched them, and accumulate across retries.
- **Verification pending:** Instrument the provider callback, auth store, runtime disposal, and device polling; cancel each of the three UI paths, then complete the browser/device authorization and assert that no credentials are written, no runtime reload occurs, and all background work terminates.
- **First-pass confidence:** High.

### L03-C05 — P1/P2 — One callback-port collision poisons all later browser OAuth retries until restart

- **Locations:** `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts:18-20`, `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts:353-460`, `packages/buddy/src/opencode-runtime/plugins/openai-codex-auth.ts:523-560`
- **Trigger:** Another process already owns TCP port `1455`, or the callback server's first `listen` attempt fails for another reason, when the user starts ChatGPT browser authorization.
- **Expected:** The attempt selects an available loopback port or fails cleanly, releases all partial state, and permits a truthful retry.
- **Observed in discovery:** The callback uses a fixed port. `startOAuthServer` assigns the module-global `oauthServer` before awaiting `listen`; its error handler rejects without closing the server object or resetting the global. Every later attempt sees a truthy `oauthServer`, reports it as reused, and returns a redirect URI even though that Buddy server never started listening. The subsequent callback wait can then last five minutes while the redirect goes to the conflicting process or nowhere useful.
- **Impact:** A normal local port collision can block the primary ChatGPT sign-in path during first use. Retrying changes a prompt failure into a long, misleading wait and cannot recover without restarting Buddy; a persistent collision survives restart.
- **Verification pending:** Hold port `1455` with a sentinel process, attempt authorization twice, and assert both attempts fail promptly without a stale server global; then release the port and confirm the same Buddy process can retry successfully.
- **First-pass confidence:** High.

### L03-C06 — P1 — Partial notebook creation makes an incomplete onboarding run look complete after restart

- **Locations:** `packages/web/src/lib/onboarding-flow.ts:195-229`, `packages/web/src/routes/onboarding.tsx:398-437`, `packages/web/src/state/chat-actions.ts:964-984`, `packages/web/src/lib/desktop-onboarding.ts:24-41`, `packages/web/src/lib/desktop-onboarding.ts:71-95`, `packages/web/src/lib/desktop-onboarding.ts:97-110`
- **Trigger:** Provider-catalog/model resolution fails, or Buddy exits, after `openInboxNotebook` has durably created and registered the Inbox but before model selection and `markSetupCompleted` finish.
- **Expected:** Restart resumes the unfinished setup or rolls back the partial notebook; an opened directory alone must not attest that first-use configuration succeeded.
- **Observed in discovery:** `configureNotebookForOnboarding` runs `prepareNotebook` before it loads the provider catalog or proves that a usable model exists. The route's `prepareNotebook` creates the managed Inbox immediately. If later work throws, the catch leaves that open project registered. On the next launch, desktop entry routing ignores the stored `setupCompleted` value and treats any frontend or backend `openProjects` entry as sufficient to skip onboarding and route to chat.
- **Impact:** A new user can be dropped into chat without the intended provider/model selection or remaining personalization state. The first real prompt can then fail, while the onboarding recovery UI that explained the problem is no longer reachable through normal startup.
- **Verification pending:** Fail model resolution immediately after Inbox creation and separately terminate at each boundary through `markSetupCompleted`; restart with persisted backend registry plus freshly hydrated frontend state, and assert onboarding resumes until a usable model is committed.
- **First-pass confidence:** High.

### L03-C07 — P1/P2 — Starter-chat retries are not atomic with session creation or idempotent prompt acceptance

- **Locations:** `packages/web/src/components/layout/chat-left-sidebar/get-started-chats.tsx:17-25`, `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts:1214-1229`, `packages/web/src/state/chat-actions.ts:1337-1359`, `packages/web/src/state/chat-actions.ts:1541-1547`, `packages/web/src/state/chat-actions.ts:1580-1767`
- **Trigger:** The first starter prompt fails after its session is created because of an offline transition, expired credential, rate limit, backend failure, or an ambiguous lost HTTP response; the user then clicks the starter again.
- **Expected:** Creating the starter session and accepting its first prompt behaves as one recoverable, idempotent operation: retry reuses or reconciles the same attempt and cannot execute the starter twice.
- **Observed in discovery:** `onStartGetStartedChat` first creates and selects a durable session, then sends a separate async prompt. Prompt failure removes the optimistic message but never removes or marks the new session as a retryable starter attempt. The starter button is re-enabled in `finally`, and the next click unconditionally creates another session with a fresh message ID. If the first response was lost after backend acceptance, the original execution can continue while the retry starts a second execution.
- **Impact:** The first advertised interaction can leave blank duplicate sessions or run an expensive/tool-using starter twice. The user has no reliable indication whether retry is safe after a transport failure.
- **Verification pending:** Inject failures before prompt acceptance, after backend acceptance but before the client response, and during the first provider stream; retry the same starter and assert one session, one user message identity, and at most one execution survive reconciliation.
- **First-pass confidence:** High for orphan/duplicate sessions; medium-high for duplicate execution until the ambiguous-response case is reproduced.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage and seams with no additional retained candidate

- Embedded desktop binding uses loopback plus a random per-run password.
- Electron's backend-header hook compares exact origins and does not overwrite an existing Authorization header.
- Authenticated health probes cover both Buddy and vendored health routes.
- API-key input, auth set/remove routes, provider catalog refresh, ChatGPT account/model availability, token refresh account correlation, and logout cache clearing were traced end to end; no separate secret-in-log or redirect leak was retained in this pass.
- The unlocked/non-atomic `auth.json` persistence mechanism is owned by the durable-storage audit in `LAUNCH-04`; it is not duplicated here as a second credential candidate.
- Buddy registers and forwards `buddy://` URLs, but current provider OAuth uses the loopback callback and no provider flow consumes the custom-protocol payload, so no credential-bearing deep-link candidate was retained.
- Onboarding state hydration, provider choice, notebook-home selection, personalization resume, starter visibility, and first-prompt submission/retry paths were included in this discovery pass.
