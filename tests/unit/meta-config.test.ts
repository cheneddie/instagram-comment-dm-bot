import { describe, expect, it } from 'vitest';
import { resolveMetaBaseUrl } from '../../src/meta/config';

describe('Meta login host configuration', () => {
  it('uses Facebook Graph for Unified Login', () => {
    expect(resolveMetaBaseUrl('unified')).toBe('https://graph.facebook.com');
  });
  it('uses Instagram Graph for legacy Instagram Login', () => {
    expect(resolveMetaBaseUrl('instagram')).toBe('https://graph.instagram.com');
  });
  it('rejects mismatched host and login mode', () => {
    expect(() => resolveMetaBaseUrl('unified', 'https://graph.instagram.com')).toThrow();
    expect(() => resolveMetaBaseUrl('instagram', 'https://graph.facebook.com')).toThrow();
  });
  it('rejects unknown login modes', () => {
    expect(() => resolveMetaBaseUrl('facebook')).toThrow();
  });
});
