# Skill Library Known Issues

## No visible install progress for curated skills

When a user installs a skill from the library, the UI currently disables the action but does not show a spinner, loading label, download indicator, or file-level progress.

What the user sees today:

- the install button becomes unavailable
- the page can appear hung for some time
- the skill flips to `Installed` only after the backend work completes

Why this is a problem:

- larger skills or skills with multiple files feel unreliable
- there is no clear signal that download and extraction are still in progress
- the experience gets worse on slower Windows machines
