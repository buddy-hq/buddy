import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { mkdirSync, realpathSync } from 'node:fs'
import { app } from '../src/index.ts'
import { createGitRepo } from './helpers/repo'

describe('project routes', () => {
  test('returns the canonical project for nested directories', async () => {
    const repo = createGitRepo('buddy-route-project-current')
    const canonicalRepo = realpathSync(repo)
    const nested = path.join(repo, 'nested')
    mkdirSync(nested, { recursive: true })

    const response = await app.request('/api/project/current', {
      headers: {
        'x-buddy-directory': nested,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: expect.any(String),
      worktree: canonicalRepo,
    })
  })

  test('lists and updates projects with the vendored project payload', async () => {
    const repo = createGitRepo('buddy-route-project-list')
    const canonicalRepo = realpathSync(repo)

    const currentResponse = await app.request('/api/project/current', {
      headers: {
        'x-buddy-directory': repo,
      },
    })

    expect(currentResponse.status).toBe(200)
    const current = (await currentResponse.json()) as {
      id: string
      worktree: string
      name?: string
    }

    const listResponse = await app.request('/api/project')
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as Array<{
      id: string
      worktree: string
      name?: string
    }>

    expect(Array.isArray(list)).toBe(true)
    expect(
      list.some((project) => project.id === current.id && project.worktree === canonicalRepo),
    ).toBe(true)

    const updateResponse = await app.request(`/api/project/${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Renamed project',
      }),
    })

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: current.id,
      worktree: canonicalRepo,
      name: 'Renamed project',
    })
  })

  test('project route no longer accepts project.open POST', async () => {
    const response = await app.request('/api/project', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        directory: '.',
      }),
    })

    expect(response.status).toBe(404)
  })
})
