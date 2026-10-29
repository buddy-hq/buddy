# Writing Release Notes

Release notes tell the people who use Buddy what changed for them. Whoever cuts the release writes them, usually an agent. They are not a list of commits.

---

## 1. Who reads them, and where

People who learn and teach with Buddy, not its developers. They meet the notes in two places:

- **The update panel in the app.** It shows the **first 8 lines** of each release, cuts each line at **220 characters**, and lists the last 5 releases. Headings are dropped and every other non-empty line is an item, so an intro paragraph uses up item slots.
- **The GitHub release page.** Stable shows the full notes there. Beta notes are hidden on GitHub and appear only in Buddy Beta's update panel. The cut adds the hiding wrapper itself.

So the first 8 lines are, for most people, the whole release.

## 2. Steps

1. Print the raw input for the release you are cutting:

   ```sh
   bun run release:notes:input --channel beta
   ```

   It names the exact range: from the previous release in the same channel to `HEAD`. The first Beta starts from the newest Stable release. It lists each commit with its short hash.

2. Find out what really changed. Commit subjects can mislead, so read `git show --stat <hash>` for every commit that might matter, and the full diff when the subject is unclear. Look for effects that are easy to miss: a dependency upgrade that fixes a crash, a refactor that ends a hang, a timeout that stops a stall.

3. Keep only what a person using Buddy would notice. Drop tests, CI, refactors, tooling, docs and release plumbing, unless they change what someone sees or can do.

4. Write the notes to a file outside the repository, for example `/tmp/buddy-beta-0.1.0-notes.md`. Never commit it.

5. Cut the release with the notes and a title:

   ```sh
   bun run release:cut:beta --fs --targets all --notes /tmp/buddy-beta-0.1.0-notes.md --title "Buddy Beta 0.1.0"
   ```

   Fast mode refuses to run without `--notes`. See [cut.md](cut.md) for the rest of the cut.

## 3. Format

- One item per line, each starting with `- `. No intro paragraph.
- Most important first. Aim for 8 items or fewer. If there are more, the first 8 lines must be the 8 that matter most; the rest appear only on the GitHub page.
- Headings are optional. Use `## New`, `## Improved` and `## Fixed`, in that order, only when 8 items or fewer remain, because the app drops headings and shows the first 8 lines whatever their group.
- One sentence per item, under 220 characters.
- Title: `Buddy <version>` or `Buddy Beta <version>`. A short theme may follow a colon: `Buddy Beta 0.1.0: faster notebooks`. Without `--title`, the title is the tag.

## 4. Style

- **Say what changed for the person, not for the code.** Name the screen or action, and the platform when only one is affected.
- **Use the app's own words:** notebook, chat, Bench, Sources, persona. Never name internals such as OpenCode, the runtime, the adapter, the SDK, Turbo or CI.
- **Fixes say what works now:** "Opening an EPUB from Sources works again on Windows." Not "Fixed a bug where…".
- **No commit prefixes, hashes, PR numbers or author handles.**
- **No marketing.** No exclamation marks, no "We're excited", no promises about future releases.
- **Anything the person must do comes first**, for example signing in again after an upgrade.
- **Security changes describe the protection, never how an attack works:** "Buddy now asks before a shell command changes files outside your notebook."

| Commit-speak | Written for people |
| --- | --- |
| `fix: keep one EPUB class when opening books in development` | Opening an EPUB from Sources works again on Windows. |
| `fix: shell commands that name files outside the notebook ask for approval again` | Buddy asks before a shell command creates, moves or deletes files outside your notebook. |
| `fix: a file search the client cancels ends quietly instead of logging a server error` | (Leave it out: nobody saw this.) |

## 5. What the cut checks

The cut validates the notes before it writes anything to GitHub.

- **Stops the cut:** empty notes, the raw input's header still in the file, or notes too long for a GitHub release.
- **Warns and continues:** more than 8 items, an item over 220 characters, or an item that starts with a commit prefix like `fix:`.

Read the warnings. Each one means a person will see something worse than you intended.
