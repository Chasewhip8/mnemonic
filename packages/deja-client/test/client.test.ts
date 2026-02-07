import { describe, test, expect, mock } from 'bun:test'
import { deja, type Learning, type InjectResult, type QueryResult, type Stats } from '../src/index'

// Mock response helper
const mockResponse = <T>(data: T, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Sample data
const sampleLearning: Learning = {
  id: '1234567890-abc123def',
  trigger: 'deploy failed',
  learning: 'check wrangler.toml first',
  confidence: 0.8,
  scope: 'shared',
  createdAt: '2026-02-04T12:00:00.000Z',
}

describe('deja-client', () => {
  describe('learn', () => {
    test('sends correct POST request with minimal args', async () => {
      let capturedRequest: { url: string; method: string; body: unknown } | null = null

      const mockFetch = mock(async (url: string, init?: RequestInit) => {
        capturedRequest = {
          url,
          method: init?.method || 'GET',
          body: init?.body ? JSON.parse(init.body as string) : null,
        }
        return mockResponse(sampleLearning)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.learn('deploy failed', 'check wrangler.toml first')

      expect(capturedRequest?.url).toBe('https://deja.example.com/learn')
      expect(capturedRequest?.method).toBe('POST')
      expect(capturedRequest?.body).toEqual({
        trigger: 'deploy failed',
        learning: 'check wrangler.toml first',
        confidence: 0.8,
        scope: 'shared',
        reason: undefined,
        source: undefined,
      })
      expect(result).toEqual(sampleLearning)
    })

    test('sends correct POST request with all options', async () => {
      let capturedBody: unknown = null

      const mockFetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : null
        return mockResponse(sampleLearning)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      await mem.learn('migration failed', 'check foreign keys', {
        confidence: 0.95,
        scope: 'agent:deployer',
        reason: 'Learned from production incident',
        source: 'ops-runbook',
      })

      expect(capturedBody).toEqual({
        trigger: 'migration failed',
        learning: 'check foreign keys',
        confidence: 0.95,
        scope: 'agent:deployer',
        reason: 'Learned from production incident',
        source: 'ops-runbook',
      })
    })

    test('includes API key in Authorization header', async () => {
      let capturedHeaders: Record<string, string> = {}

      const mockFetch = mock(async (_url: string, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers || {})
        )
        return mockResponse(sampleLearning)
      })

      const mem = deja('https://deja.example.com', {
        apiKey: 'secret-key-123',
        fetch: mockFetch as typeof fetch,
      })
      await mem.learn('test', 'test')

      expect(capturedHeaders['Authorization']).toBe('Bearer secret-key-123')
    })
  })

  describe('inject', () => {
    const sampleInjectResult: InjectResult = {
      prompt: 'When deploy failed, check wrangler.toml first',
      learnings: [sampleLearning],
    }

    test('sends correct POST request with defaults', async () => {
      let capturedBody: unknown = null

      const mockFetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : null
        return mockResponse(sampleInjectResult)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.inject('deploying to production')

      expect(capturedBody).toEqual({
        context: 'deploying to production',
        scopes: ['shared'],
        limit: 5,
        format: 'prompt',
      })
      expect(result.prompt).toContain('check wrangler.toml')
      expect(result.learnings).toHaveLength(1)
    })

    test('sends correct POST request with custom options', async () => {
      let capturedBody: unknown = null

      const mockFetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : null
        return mockResponse(sampleInjectResult)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      await mem.inject('deploying', {
        scopes: ['agent:deployer', 'shared'],
        limit: 10,
        format: 'learnings',
      })

      expect(capturedBody).toEqual({
        context: 'deploying',
        scopes: ['agent:deployer', 'shared'],
        limit: 10,
        format: 'learnings',
      })
    })
  })

  describe('query', () => {
    const sampleQueryResult: QueryResult = {
      learnings: [sampleLearning],
      hits: { shared: 1 },
    }

    test('sends correct POST request', async () => {
      let capturedBody: unknown = null

      const mockFetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : null
        return mockResponse(sampleQueryResult)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.query('wrangler')

      expect(capturedBody).toEqual({
        text: 'wrangler',
        scopes: ['shared'],
        limit: 10,
      })
      expect(result.learnings).toHaveLength(1)
      expect(result.hits.shared).toBe(1)
    })
  })

  describe('list', () => {
    test('sends GET request without params', async () => {
      let capturedUrl = ''

      const mockFetch = mock(async (url: string) => {
        capturedUrl = url
        return mockResponse([sampleLearning])
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.list()

      expect(capturedUrl).toBe('https://deja.example.com/learnings')
      expect(result).toHaveLength(1)
    })

    test('sends GET request with query params', async () => {
      let capturedUrl = ''

      const mockFetch = mock(async (url: string) => {
        capturedUrl = url
        return mockResponse([sampleLearning])
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      await mem.list({ scope: 'agent:deployer', limit: 5 })

      expect(capturedUrl).toBe('https://deja.example.com/learnings?scope=agent%3Adeployer&limit=5')
    })
  })

  describe('forget', () => {
    test('sends DELETE request with ID', async () => {
      let capturedRequest: { url: string; method: string } | null = null

      const mockFetch = mock(async (url: string, init?: RequestInit) => {
        capturedRequest = { url, method: init?.method || 'GET' }
        return mockResponse({ success: true })
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.forget('1234567890-abc123def')

      expect(capturedRequest?.url).toBe('https://deja.example.com/learning/1234567890-abc123def')
      expect(capturedRequest?.method).toBe('DELETE')
      expect(result.success).toBe(true)
    })
  })

  describe('stats', () => {
    const sampleStats: Stats = {
      totalLearnings: 42,
      totalSecrets: 3,
      scopes: {
        shared: { learnings: 30, secrets: 2 },
        'agent:deployer': { learnings: 12, secrets: 1 },
      },
    }

    test('sends GET request and returns stats', async () => {
      let capturedUrl = ''

      const mockFetch = mock(async (url: string) => {
        capturedUrl = url
        return mockResponse(sampleStats)
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })
      const result = await mem.stats()

      expect(capturedUrl).toBe('https://deja.example.com/stats')
      expect(result.totalLearnings).toBe(42)
      expect(result.scopes.shared.learnings).toBe(30)
    })
  })

  describe('error handling', () => {
    test('throws on HTTP error with message from response', async () => {
      const mockFetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'unauthorized - API key required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })

      await expect(mem.learn('test', 'test')).rejects.toThrow('unauthorized - API key required')
    })

    test('throws on HTTP error with status fallback when JSON parse fails', async () => {
      const mockFetch = mock(async () => {
        return new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      })

      const mem = deja('https://deja.example.com', { fetch: mockFetch as typeof fetch })

      // Falls back to statusText when body isn't valid JSON
      await expect(mem.stats()).rejects.toThrow('Internal Server Error')
    })
  })

  describe('URL handling', () => {
    test('strips trailing slash from base URL', async () => {
      let capturedUrl = ''

      const mockFetch = mock(async (url: string) => {
        capturedUrl = url
        return mockResponse(sampleLearning)
      })

      const mem = deja('https://deja.example.com/', { fetch: mockFetch as typeof fetch })
      await mem.learn('test', 'test')

      expect(capturedUrl).toBe('https://deja.example.com/learn')
    })
  })
})
