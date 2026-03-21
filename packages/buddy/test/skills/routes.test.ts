import { describe, expect, test } from 'bun:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { app } from '../../src/index.ts'
import { Config } from '@buddy/backend/config'
import { Global } from '../../src/storage'
import { createGitRepo, runGit } from '../helpers/repo'

function createCuratedSkillsRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ['init', '-q'])

  const releaseNotesSkillDir = path.join(root, 'skills', '.curated', 'release-notes')
  fs.mkdirSync(path.join(releaseNotesSkillDir, 'references'), {
    recursive: true,
  })
  writeFileSync(
    path.join(releaseNotesSkillDir, 'SKILL.md'),
    `---
name: release-notes
description: Draft release notes from completed changes.
summary: Turn merged work into a concise release update.
example_prompt: Use release-notes to summarize this sprint.
---

Create a polished release summary grouped by user impact.
`,
  )
  writeFileSync(
    path.join(releaseNotesSkillDir, 'references', 'template.md'),
    '## Release notes template\n',
  )

  runGit(root, ['add', '.'])
  runGit(root, [
    '-c',
    'user.email=buddy@test.local',
    '-c',
    'user.name=Buddy Test',
    'commit',
    '-qm',
    'init',
  ])
  return root
}

describe('skills routes', () => {
  test('applies skills v2 roots, external toggle, and curated install flow', async () => {
    const repo = createGitRepo('buddy-route-skills')
    const workspaceAgentSkillDir = path.join(repo, '.agents', 'skills', 'local-review')
    fs.mkdirSync(workspaceAgentSkillDir, {
      recursive: true,
    })
    writeFileSync(
      path.join(workspaceAgentSkillDir, 'SKILL.md'),
      `---
name: local-review
description: Workspace-local review workflow.
---

Use the local review workflow for this repository.
`,
    )

    const curatedRepo = createCuratedSkillsRepo('buddy-curated-skills')
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'buddy-skills-home-'))
    const previousHome = process.env.HOME
    const previousBuddyHome = process.env.BUDDY_TEST_HOME
    const previousCodexHome = process.env.CODEX_HOME
    const previousCuratedRepo = process.env.BUDDY_CURATED_SKILLS_REPO_URL
    const globalFile = path.join(Global.Path.config, 'buddy.jsonc')
    const previousGlobal = fs.existsSync(globalFile)
      ? fs.readFileSync(globalFile, 'utf8')
      : undefined

    process.env.HOME = fakeHome
    process.env.BUDDY_TEST_HOME = fakeHome
    process.env.CODEX_HOME = path.join(fakeHome, '.codex')
    process.env.BUDDY_CURATED_SKILLS_REPO_URL = curatedRepo

    fs.rmSync(path.join(fakeHome, '.buddy'), {
      recursive: true,
      force: true,
    })
    fs.rmSync(globalFile, {
      force: true,
    })

    try {
      const listBefore = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })

      expect(listBefore.status).toBe(200)
      const beforeBody = (await listBefore.json()) as {
        managedRoot: string
        externalVendorRootsEnabled: boolean
        installed: Array<{ name: string }>
        library: Array<{ id: string; installed: boolean }>
      }

      expect(beforeBody.managedRoot).toBe(path.join(fakeHome, '.buddy', 'skills'))
      expect(beforeBody.externalVendorRootsEnabled).toBe(false)
      expect(beforeBody.installed.some((skill) => skill.name === 'local-review')).toBe(false)
      expect(beforeBody.library.length).toBe(0)

      const toggleOnResponse = await app.request('/api/skills/settings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-buddy-directory': repo,
        },
        body: JSON.stringify({
          externalVendorRootsEnabled: true,
        }),
      })
      expect(toggleOnResponse.status).toBe(200)

      const listAfterToggle = await app.request('/api/skills?refresh=1', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterToggle.status).toBe(200)
      const afterToggleBody = (await listAfterToggle.json()) as {
        externalVendorRootsEnabled: boolean
        installed: Array<{ name: string; scope: string; permissionAction: string }>
        library: Array<{ id: string; installed: boolean }>
      }
      expect(afterToggleBody.externalVendorRootsEnabled).toBe(true)
      expect(
        afterToggleBody.installed.some(
          (skill) =>
            skill.name === 'local-review' &&
            skill.scope === 'workspace' &&
            skill.permissionAction === 'ask',
        ),
      ).toBe(true)
      expect(
        afterToggleBody.library.some(
          (entry) => entry.id === 'release-notes' && entry.installed === false,
        ),
      ).toBe(true)

      const installResponse = await app.request('/api/skills/library/release-notes/install', {
        method: 'POST',
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(installResponse.status).toBe(200)

      const listAfterInstall = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterInstall.status).toBe(200)
      const afterInstallBody = (await listAfterInstall.json()) as {
        installed: Array<{ name: string; enabled: boolean; source: string }>
        library: Array<{ id: string; installed: boolean }>
      }

      expect(
        afterInstallBody.installed.some(
          (skill) => skill.name === 'release-notes' && skill.enabled && skill.source === 'library',
        ),
      ).toBe(true)
      expect(
        afterInstallBody.library.some((entry) => entry.id === 'release-notes' && entry.installed),
      ).toBe(true)

      const disableResponse = await app.request('/api/skills/release-notes', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-buddy-directory': repo,
        },
        body: JSON.stringify({
          enabled: false,
        }),
      })
      expect(disableResponse.status).toBe(200)

      const listAfterDisable = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterDisable.status).toBe(200)
      const afterDisableBody = (await listAfterDisable.json()) as {
        installed: Array<{ name: string; enabled: boolean }>
      }
      expect(
        afterDisableBody.installed.some(
          (skill) => skill.name === 'release-notes' && skill.enabled === false,
        ),
      ).toBe(true)

      const localRuleResponse = await app.request('/api/skills/local-review', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-buddy-directory': repo,
        },
        body: JSON.stringify({
          action: 'deny',
        }),
      })
      expect(localRuleResponse.status).toBe(200)

      const listAfterLocalRule = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterLocalRule.status).toBe(200)
      const afterLocalRuleBody = (await listAfterLocalRule.json()) as {
        installed: Array<{
          name: string
          scope: string
          enabled: boolean
          permissionAction: string
        }>
      }
      expect(
        afterLocalRuleBody.installed.some(
          (skill) =>
            skill.name === 'local-review' &&
            skill.scope === 'workspace' &&
            skill.enabled === false &&
            skill.permissionAction === 'deny',
        ),
      ).toBe(true)

      const configAfterLocalRule = await Config.getGlobal()
      const skillRules =
        configAfterLocalRule.permission &&
        typeof configAfterLocalRule.permission !== 'string' &&
        typeof configAfterLocalRule.permission.skill !== 'string'
          ? configAfterLocalRule.permission.skill
          : undefined
      expect(skillRules?.['local-review']).toBe('deny')

      const createResponse = await app.request('/api/skills', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-buddy-directory': repo,
        },
        body: JSON.stringify({
          name: 'Local Review',
          description: 'Should collide with the existing workspace skill.',
          content: 'This should be rejected.',
        }),
      })
      expect(createResponse.status).toBe(409)

      const createUniqueResponse = await app.request('/api/skills', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-buddy-directory': repo,
        },
        body: JSON.stringify({
          name: 'Plan Helper',
          description: 'Builds a focused plan before coding.',
          examplePrompt: 'Use the plan-helper skill to organize this task.',
          content: 'Plan clearly, then execute in the smallest safe steps.',
        }),
      })
      expect(createUniqueResponse.status).toBe(200)

      const listAfterCreate = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterCreate.status).toBe(200)
      const afterCreateBody = (await listAfterCreate.json()) as {
        installed: Array<{ name: string; source: string }>
      }
      expect(
        afterCreateBody.installed.some(
          (skill) => skill.name === 'plan-helper' && skill.source === 'custom',
        ),
      ).toBe(true)

      const removeCustomResponse = await app.request('/api/skills/plan-helper', {
        method: 'DELETE',
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(removeCustomResponse.status).toBe(200)

      const removeLibraryResponse = await app.request('/api/skills/release-notes', {
        method: 'DELETE',
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(removeLibraryResponse.status).toBe(200)

      const listAfterRemove = await app.request('/api/skills', {
        headers: {
          'x-buddy-directory': repo,
        },
      })
      expect(listAfterRemove.status).toBe(200)
      const afterRemoveBody = (await listAfterRemove.json()) as {
        installed: Array<{ name: string }>
      }
      expect(afterRemoveBody.installed.some((skill) => skill.name === 'plan-helper')).toBe(false)
      expect(afterRemoveBody.installed.some((skill) => skill.name === 'release-notes')).toBe(false)
    } finally {
      process.env.HOME = previousHome
      process.env.BUDDY_TEST_HOME = previousBuddyHome
      process.env.CODEX_HOME = previousCodexHome
      process.env.BUDDY_CURATED_SKILLS_REPO_URL = previousCuratedRepo

      fs.rmSync(path.join(fakeHome, '.buddy'), {
        recursive: true,
        force: true,
      })

      if (previousGlobal === undefined) {
        fs.rmSync(globalFile, {
          force: true,
        })
      } else {
        writeFileSync(globalFile, previousGlobal)
      }

      await Config.updateGlobal({})
    }
  })
})
