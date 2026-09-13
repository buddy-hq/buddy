# Buddy Notes V1 — desktop E2E checklist

Run on macOS and Windows when Notes storage, permissions, Bench routing, or settings change.

## 1. Standalone note

1. Open a notebook and the Notes drawer.
2. Choose **New note**.
3. Verify one editable Markdown document opens in Bench.
4. Edit and save it.
5. Rename it from the title field.
6. Close and reopen it from the drawer.

Pass: the body persists, the filename keeps its ULID, the Notes URL declares `root=notes`, and no duplicate editor or tab appears during the rename navigation.

## 2. Plain Markdown discovery

1. Outside Buddy, add `index.md` and `raw/source.md` to the configured Notes library without Buddy frontmatter.
2. Refresh or reopen the Notes drawer.
3. Switch to **All notes**.
4. Open, edit, save, and rename `index.md`.

Pass: both files are visible, `index.md` remains ordinary Markdown, and the rename does not add Buddy frontmatter or a ULID.

## 3. Composer capture

1. Start a chat.
2. Switch the composer to **Note** mode and save text.
3. Save a second composer note in the same chat.
4. Open the saved note from the confirmation action.

Pass: both entries appear in one editable `buddy-session-note`, its frontmatter stores `buddy-session-id`, and there is no generated transcript file or `Sessions/` folder.

## 4. Message annotation

1. Add a note to a visible user message.
2. Add a note to a visible assistant message.
3. Open the chat's session note.

Pass: each entry contains the quoted readable message plus the user's annotation. Synthetic prompt attachments and hidden runtime text do not appear.

## 5. Notebook grouping and rename

1. Create a stamped note in notebook A.
2. Confirm it appears under **This notebook** in A and under **All notes** elsewhere.
3. Rename notebook A outside Buddy, then reopen it.
4. List Notes again and inspect the note file outside Buddy.

Pass: the note remains grouped by stable notebook ID, Buddy displays the new notebook name, and listing did not rewrite the old readable frontmatter label.

## 6. Notes-library setting

1. Open Settings and choose a different Notes library containing at least one plain Markdown file.
2. Return to a notebook and open Notes.
3. Change Buddy Home separately.

Pass: changing the Notes setting moves no files, stale Notes Bench tabs are removed, the new library is listed, and changing Buddy Home does not change the Notes pointer.

## 7. Permissions

Use a project policy with direct reads set to ask, direct edits set to allow, and bash set to allow.

1. Ask Buddy to read a Notes file with the read tool.
2. Ask Buddy to edit a Notes file with the edit tool.
3. Ask Buddy to run an unrelated shell command.

Pass: the direct read is promptless, the direct edit asks, and bash follows the configured allow policy. No permission changes appear in the user's project config.

## 8. Portability inspection

Inspect a Buddy-created note and a plain note outside Buddy.

Pass:

- both are valid Markdown;
- Buddy-created types are only `buddy-note` or `buddy-session-note`;
- Buddy-created filenames contain a readable title and ULID;
- links use ordinary Markdown or Obsidian wikilink syntax;
- no manifest, sidecar database, synthetic Bench path, or Buddy-only URL is required.
