# Release QA Checklist

**Platform:** macOS / Windows desktop
**Build:** _______________ · **Tester:** _______________ · **Date:** _______________

Related: [User journey — critical path and test coverage](../../features/release/user-journey.md) (inventory, golden run, automated vs manual gaps). The executable steps and sign-off live in this checklist.

## Execution Rules

1. **Sequential execution:** Execute one run top-to-bottom. If any step fails, stop, file a blocker, and do not ship.
2. **Manual verification:** All steps require manual execution in a packaged or production build.
3. **Required fixtures:**
   - One small valid PDF (< 5 MB) and one EPUB (< 5 MB)
   - Skill **xlsx-author** (available in Skills Library)
4. **Required runs before ship:**
   - **Run A:** Free models (full 12-step flow on fresh install/state)
   - **Run B:** Paid provider / OAuth (steps 2–12 on fresh state)
   - **Run C:** Auto-update (when a newer build is staged)

---

## Run A — Free Models

### 1. Install & Launch
- [ ] Download packaged artifact and launch Buddy.
- **Pass:** Window opens, no crash, backend reaches onboarding/chat within 60s.
- **Fail:** Crash on launch, blank screen > 60s, or repeated fatal error toast.

### 2. Onboard
- [ ] Choose **Continue with free models** → complete/skip personalization → land in notebook chat.
- **Pass:** Route is `/$directory/chat`, composer is responsive.
- **Fail:** Stuck in onboarding, provider error without recovery.

### 3. Chat
- [ ] Send: `What is this notebook for? Answer in one sentence.`
- **Pass:** Tokens stream, assistant reply completes, spinner clears.
- **Fail:** Hangs, error toast, empty response, or permanent spinner.

### 4. Resource Import & Preparation
- [ ] Library → **Resources** → add PDF or EPUB fixture via drag-and-drop or picker.
- **Pass:** Resource appears in catalog, reaches **Ready** status within 5 minutes.
- **Fail:** Import throws, error toast, or remains stuck in `preparing`.

### 5. Reader Surface
- [ ] Click ready resource to open reader in Bench.
- **Pass:** Content renders clearly; page navigation, zoom, or scrolling operates smoothly.
- **Fail:** Blank reader, error fallback, or Bench fails to mount.

### 6. Read + Chat Grounding
- [ ] With reader open, send: `Summarize the page I'm on in one sentence.`
- **Pass:** Turn completes referencing active reading context; reader remains interactive.
- **Fail:** Chat fails, reader unmounts/resets, or reply lacks passage grounding.

### 7. Flashcards
- [ ] Send: `Make a flashcard deck with 3 cards from this material.` → Library → **Flashcards** → open deck → flip card → rate card.
- **Pass:** Deck appears in library, opens in Bench, card flips and accepts review rating.
- **Fail:** Deck generation fails, missing from library, or review UI throws.

### 8. Skill Installation & Removal
- [ ] Sidebar → **Skills** → **Library** → install **xlsx-author** → switch to **Installed** → remove.
- Installation may look idle for a while. Wait for the Installed state; do not click install twice.
- **Pass:** Reaches Installed state cleanly; disappears after removal; no error toast.
- **Fail:** Install/remove error, stuck button > 5 minutes.

### 9. Standards Package Toggle
- [ ] Settings → **Advanced** → Packages → enable **Standards** → wait for ready → confirm **Standards** settings tab appears → disable **Standards** → confirm removal.
- Download can take several minutes while the toggle remains busy. Wait; do not toggle it again.
- **Pass:** Toggle reaches enabled/ready; Standards tab appears and disappears cleanly.
- **Fail:** Package download/install error, lingering error state.

### 10. Advanced Math Package Toggle
- [ ] Settings → **Advanced** → Packages → enable **Advanced math** → wait for ready → disable → confirm removal.
- First installation builds the runtime and can take several minutes; progress UI is minimal.
- **Pass:** Reaches ready state; uninstalls cleanly without lingering error.
- **Fail:** Build/install fails or hangs > 15 minutes; error persists.

### 11. App Relaunch & Persistence
- [ ] Fully quit Buddy (`Cmd+Q` / `Alt+F4`) → reopen application.
- **Pass:** Prior notebook reopens; chat history, resources, and settings persist intact; packages disabled in step 10 remain disabled.
- **Fail:** Lost notebook state, empty chat session, missing resources, or reset settings.

### 12. Settings & Personalization
- [ ] Settings → **Providers**: verify connection · **Personalization**: edit preferred name → navigate away → return.
- **Pass:** Provider remains connected; personalization edits persist.
- **Fail:** Provider disconnects or fields revert unexpectedly.

---

## Run B — OAuth / Paid Provider

**Setup:** Fresh install, or reset both onboarding and provider state. Do not repeat Run A step 1 unless this run intentionally tests installation and OAuth together.

- [ ] **2. Onboard:** Provider OAuth completes → lands in notebook chat.
- [ ] **3. Chat:** Message streams to completion.
- [ ] **4. Import:** Resource prepares to `ready`.
- [ ] **5. Read:** Reader opens and renders in Bench.
- [ ] **6. Read + Chat:** Turn completes with active passage context.
- [ ] **7. Flashcards:** Deck creation and card rating succeed.
- [ ] **8. Skill:** `xlsx-author` installs and uninstalls cleanly.
- [ ] **9. Standards:** Package enables and disables cleanly.
- [ ] **10. Advanced Math:** Package enables and disables cleanly.
- [ ] **11. Relaunch:** State and session history survive application restart.
- [ ] **12. Settings:** Provider tokens and personalization persist.

- **Pass:** All steps succeed without manual workaround.
- **Fail:** OAuth cancellation has no recovery path, OAuth token drops on restart, the provider disconnects, or any step fails.

---

## Run C — Auto-Update *(Staged Builds)*

- [ ] Launch staged update or trigger Settings → General → **Check for updates**.
- [ ] Accept update → application restarts on new version.
- **Pass:** App restarts cleanly with version matching staged release; data intact.
- **Fail:** Update check fails, download hangs, install fails, or app fails to relaunch.

---

## Sign-Off Matrix

| Run | Platform & Build | Tester | Date | Result |
| --- | --- | --- | --- | --- |
| Run A — Free Models | | | | ☐ Pass / ☐ Fail |
| Run B — OAuth Provider | | | | ☐ Pass / ☐ Fail |
| Run C — Auto-Update | | | | ☐ Pass / ☐ Fail |
| **Final Ship Decision** | | | | **☐ Approved** |

### Release Blockers Log

```text
(Log any blocking issue IDs, descriptions, and reproduction steps here)
```
