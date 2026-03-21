import { afterEach, describe, expect, test } from 'bun:test'
import {
  installAdvancedMathRuntime,
  loadAdvancedMathRuntimeStatus,
  removeAdvancedMathRuntime,
} from '../src/state/advanced-math-runtime'

const originalFetch = globalThis.fetch

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function matchesPath(input: string, pathname: string) {
  return input === pathname || input === `http://localhost${pathname}`
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('advanced math runtime state', () => {
  test('uses the advanced math runtime lifecycle endpoints', async () => {
    const requests: Array<{ url: string; method: string }> = []

    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? 'GET',
      })

      if (matchesPath(String(input), '/api/local-runtimes/advanced-math')) {
        return jsonResponse({
          enabled: false,
          state: 'not_installed',
          ready: false,
          targetTriple: 'aarch64-apple-darwin',
          supportedLibraries: [],
        })
      }

      if (
        matchesPath(String(input), '/api/local-runtimes/advanced-math/install') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({
          enabled: true,
          state: 'ready',
          ready: true,
          installedVersion: '1.2.3',
          targetTriple: 'aarch64-apple-darwin',
          supportedLibraries: ['math', 'sympy'],
        })
      }

      if (
        matchesPath(String(input), '/api/local-runtimes/advanced-math/install') &&
        init?.method === 'DELETE'
      ) {
        return jsonResponse({
          enabled: false,
          state: 'not_installed',
          ready: false,
          targetTriple: 'aarch64-apple-darwin',
          supportedLibraries: ['math', 'sympy'],
        })
      }

      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${String(input)}`)
    }) as typeof fetch

    await expect(loadAdvancedMathRuntimeStatus()).resolves.toMatchObject({
      state: 'not_installed',
      ready: false,
    })
    await expect(installAdvancedMathRuntime()).resolves.toMatchObject({
      state: 'ready',
      ready: true,
    })
    await expect(removeAdvancedMathRuntime()).resolves.toMatchObject({
      state: 'not_installed',
      ready: false,
    })

    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST', 'DELETE'])
    expect(
      requests.every(
        (request) =>
          request.url.endsWith('/api/local-runtimes/advanced-math') ||
          request.url.endsWith('/api/local-runtimes/advanced-math/install'),
      ),
    ).toBe(true)
  })

  test('surfaces backend error messages', async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        {
          error: 'install failed',
        },
        500,
      )) as typeof fetch

    await expect(installAdvancedMathRuntime()).rejects.toThrow('install failed')
  })
})
