# Pre-Release Checklist

**Platform:** macOS desktop · **Build:** _______________ · **Tester:** _______________ · **Date:** _______________

**Rule:** One run, top to bottom. Any step fails → stop, file a blocker, do not ship.

**Coverage:** No step is fully automated — all 13 require manual execution. Backend tests cover APIs for import, flashcards, standards, math, and notebook persistence only (see `user-journey.md` § Test coverage).

**Fixtures:** one small PDF or EPUB (< 5 MB) · skill **xlsx-author** (Skills → Library)

**Runs required before ship:** A (free models, full) · B (ChatGPT Plus OAuth, steps 2–12 on fresh state) · C (update, when staged)

---

## Run A — free models

### 1 · Install

- [ ] Download the GitHub release artifact and open Buddy

| | |
| --- | --- |
| **Pass** | Window opens; no immediate crash; backend reaches chat or onboarding within ~60s |
| **Fail** | Crash on launch, blank screen >60s, repeated error toast |

### 2 · Onboard

- [ ] Choose **Continue with free models** → skip or complete personalization → land in notebook chat

| | |
| --- | --- |
| **Pass** | URL is `/$directory/chat`; composer is usable |
| **Fail** | Stuck on onboarding, provider error with no recovery, never reaches chat |

### 3 · Chat

- [ ] Send: `What is this notebook for? Answer in one sentence.`

| | |
| --- | --- |
| **Pass** | Tokens stream; reply finishes; spinner clears |
| **Fail** | Hangs, error with no reply, or spinner never clears |

### 4 · Import

- [ ] Library → **Resources** → add fixture PDF or EPUB (picker or drag-drop)

| | |
| --- | --- |
| **Pass** | Resource appears; status reaches **ready** (not stuck on preparing) |
| **Fail** | Add fails, error toast, or preparing never completes within 5 min |

### 5 · Read

- [ ] Open the ready resource → reader opens in bench

| | |
| --- | --- |
| **Pass** | Content visible; can go to next page or scroll |
| **Fail** | Blank reader, load error, or bench never opens |

### 6 · Read + chat

- [ ] With reader still open, send: `Summarize the page I'm on in one sentence.`

| | |
| --- | --- |
| **Pass** | Reply completes; reader stays open and responsive |
| **Fail** | Chat breaks, reader closes unexpectedly, or reply never arrives |

### 7 · Flashcards

- [ ] Send: `Make a flashcard deck with 3 cards from this material.` → Library → **Flashcards** → open deck → flip one card → rate it

| | |
| --- | --- |
| **Pass** | Deck in library; opens in bench; review flow accepts a rating |
| **Fail** | No deck created, deck missing from library, or review UI errors |

### 8 · Skill install & remove

- [ ] Sidebar → **Skills** → **Library** → install **xlsx-author** → **Installed** tab → remove it

| | |
| --- | --- |
| **Pass** | Shows Installed after install; gone from Installed after remove; no error toast |
| **Fail** | Install/remove error, stuck button with no completion within 5 min |
| **Note** | Install may look idle for a while — wait for Installed state, don't click twice |

### 9 · Standards install & remove

- [ ] Settings → **Advanced** → Packages → **Standards** ON → wait for ready → **Standards** tab appears in settings nav → back to Advanced → OFF → confirm remove

| | |
| --- | --- |
| **Pass** | Toggle reaches enabled/ready; Standards tab visible while installed; remove completes; tab disappears |
| **Fail** | Download/install error, tab never appears, remove fails or leaves error state |
| **Note** | Download can take several minutes; toggle stays busy — wait, don't toggle again |

### 10 · Advanced math install & remove

- [ ] Same Packages section → **Advanced math** ON → wait for ready → OFF → confirm remove

| | |
| --- | --- |
| **Pass** | Reaches ready while on; removes cleanly with no lingering error |
| **Fail** | Install never completes within 15 min, remove fails, error text persists |
| **Note** | First install builds runtime — expect several minutes; progress UI is minimal |

### 11 · Relaunch

- [ ] Quit Buddy fully (Cmd+Q) → reopen

| | |
| --- | --- |
| **Pass** | Same notebook open; chat session history present; library resource still there; packages off after step 10 |
| **Fail** | Lost notebook, empty sessions, missing resource, or corrupted settings state |

### 12 · Settings

- [ ] Settings → **Providers**: provider still connected · **Personalization**: edit preferred name → leave tab → return → value saved

| | |
| --- | --- |
| **Pass** | Provider shows connected; personalization persists after navigation away |
| **Fail** | Disconnected provider, save fails, or fields reset unexpectedly |

---

## Run B — ChatGPT Plus OAuth

**Setup:** fresh install, or reset onboarding/provider state. Do **not** repeat step 1 unless testing install + OAuth together.

- [ ] **2** Onboard — ChatGPT Plus OAuth completes → notebook chat
- [ ] **3** Chat — message streams to completion
- [ ] **4** Import — resource reaches ready
- [ ] **5** Read — reader renders
- [ ] **6** Read + chat — reply with reader open
- [ ] **7** Flashcards — deck + one rated card
- [ ] **8** Skill — xlsx-author install + remove
- [ ] **9** Standards — install + remove
- [ ] **10** Advanced math — install + remove
- [ ] **11** Relaunch — state intact
- [ ] **12** Settings — provider connected + personalization saves

| | |
| --- | --- |
| **Pass** | All boxes checked |
| **Fail** | OAuth cancel with no recovery, token lost after relaunch, or any step above fails |

---

## Run C — update *(when a newer build is staged)*

- [ ] Update toast appears on launch **or** Settings → General → **Check for updates** finds a build
- [ ] Accept install → app restarts on the new version

| | |
| --- | --- |
| **Pass** | Version matches staged release after restart |
| **Fail** | No update found when one exists, install fails, or app won't reopen |

---

## Sign-off

| Run | Build | Tester | Date | Pass |
| --- | --- | --- | --- | --- |
| A — free models | | | | ☐ |
| B — ChatGPT Plus | | | | ☐ |
| C — update | | | | ☐ |
| **Ship** | | | | ☐ |

**Blockers:**

```

```
