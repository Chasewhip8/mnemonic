/**
 * Unit tests for DejaDO (Durable Object implementation)
 * These tests focus on the logic rather than the Cloudflare integration
 */

import { DejaDO } from '../src/do/DejaDO';

// Mock Cloudflare bindings
const mockEnv = {
  VECTORIZE: {
    query: jest.fn(),
    insert: jest.fn(),
    deleteByIds: jest.fn()
  },
  AI: {
    run: jest.fn()
  },
  API_KEY: 'test-key'
};

// Mock DurableObjectState
const mockState = {
  storage: {
    sql: {}
  }
};

describe('DejaDO', () => {
  let dejaDO: DejaDO;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create new instance
    // @ts-ignore - ignoring type issues for mocks
    dejaDO = new DejaDO(mockState, mockEnv);
  });

  test('should create DejaDO class', () => {
    expect(DejaDO).toBeDefined();
    expect(dejaDO).toBeInstanceOf(DejaDO);
  });

  test('should have required RPC methods', () => {
    const methods = [
      'inject',
      'learn',
      'query',
      'getLearnings',
      'deleteLearning',
      'getSecret',
      'setSecret',
      'deleteSecret',
      'getStats'
    ];
    
    methods.forEach(method => {
      expect(typeof (dejaDO as any)[method]).toBe('function');
    });
  });

  test('should serve marketing page HTML on root', async () => {
    const response = await dejaDO.fetch(
      new Request('http://localhost/', { headers: { Accept: 'text/html' } })
    );
    const body = await response.text();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('deja, the <span>durable recall</span> layer');
  });

  test('should filter scopes by priority', () => {
    // Test session scope priority
    const sessionScopes = (dejaDO as any).filterScopesByPriority(['shared', 'agent:123', 'session:456']);
    expect(sessionScopes).toEqual(['session:456']);
    
    // Test agent scope priority
    const agentScopes = (dejaDO as any).filterScopesByPriority(['shared', 'agent:123']);
    expect(agentScopes).toEqual(['agent:123']);
    
    // Test shared scope
    const sharedScopes = (dejaDO as any).filterScopesByPriority(['shared']);
    expect(sharedScopes).toEqual(['shared']);
    
    // Test empty scopes
    const emptyScopes = (dejaDO as any).filterScopesByPriority([]);
    expect(emptyScopes).toEqual([]);
  });

  test('should handle secrets', async () => {
    // Mock database initialization for secrets tests
    (dejaDO as any).initDB = jest.fn().mockResolvedValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        { name: 'test-secret', value: 'secret-value', scope: 'shared', createdAt: '2023-01-01', updatedAt: '2023-01-01' }
      ]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      and: jest.fn()
    });
    
    // Test setSecret
    const setResult = await dejaDO.setSecret('shared', 'test-secret', 'secret-value');
    expect(setResult.success).toBe(true);
    
    // Test getSecret
    const getResult = await dejaDO.getSecret(['shared'], 'test-secret');
    expect(getResult).toBe('secret-value');
    
    // Test deleteSecret
    const deleteResult = await dejaDO.deleteSecret('shared', 'test-secret');
    expect(deleteResult.success).toBe(true);
  });
});

  test('should handle scopes correctly', async () => {
    // Mock database initialization for scope tests
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        { name: 'test-secret', value: 'secret-value', scope: 'session:123', createdAt: '2023-01-01', updatedAt: '2023-01-01' }
      ]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      and: jest.fn()
    };
    
  });
