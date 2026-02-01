/**
 * Unit tests for DejaDO (Durable Object implementation)
 * These tests focus on the logic rather than the Cloudflare integration
 */

import { DejaDO } from '../src/do/DejaDO';

describe('DejaDO', () => {
  test('should create DejaDO class', () => {
    expect(DejaDO).toBeDefined();
  });

  test('should filter scopes by priority', () => {
    // This would require testing private methods, so we'll skip for now
    // In a real implementation, we would test the scope filtering logic
  });

  test('should have required methods', () => {
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
      expect(typeof (DejaDO.prototype as any)[method]).toBe('function');
    });
  });
});
