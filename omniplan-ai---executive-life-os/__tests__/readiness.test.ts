/**
 * Unit tests for services/ai/readiness.ts
 *
 * getAIReadiness() reads from getAISettings(). We mock services/settings
 * to control the returned provider/apiKey without touching storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the settings shim before importing readiness
vi.mock('../services/settings', () => ({
  getAISettings: vi.fn(),
}));

import { getAIReadiness } from '../services/ai/readiness';
import { getAISettings } from '../services/settings';

const mockGetAISettings = getAISettings as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 'disabled' state
// ---------------------------------------------------------------------------

describe("getAIReadiness — 'disabled' state", () => {
  it("returns state='disabled' when provider is 'none'", () => {
    mockGetAISettings.mockReturnValue({ provider: 'none', apiKey: '' });
    const r = getAIReadiness();
    expect(r.state).toBe('disabled');
    expect(r.canRun).toBe(false);
    expect(r.provider).toBe('none');
    expect(r.label).toBe('AI disabled');
    expect(r.hint).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// 'missing_key' state
// ---------------------------------------------------------------------------

describe("getAIReadiness — 'missing_key' state", () => {
  it.each([
    ['gemini'],
    ['openai'],
    ['anthropic'],
  ])("returns state='missing_key' when provider is '%s' and apiKey is empty", (provider) => {
    mockGetAISettings.mockReturnValue({ provider, apiKey: '' });
    const r = getAIReadiness();
    expect(r.state).toBe('missing_key');
    expect(r.canRun).toBe(false);
    expect(r.label).toBe('API key missing');
    expect(r.hint).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// 'ready' state
// ---------------------------------------------------------------------------

describe("getAIReadiness — 'ready' state", () => {
  it("returns state='ready' when provider='gemini' and apiKey is present", () => {
    mockGetAISettings.mockReturnValue({ provider: 'gemini', apiKey: 'sk-test-123' });
    const r = getAIReadiness();
    expect(r.state).toBe('ready');
    expect(r.canRun).toBe(true);
    expect(r.hint).toBe('');
    expect(r.label).toContain('gemini');
  });

  it("returns state='ready' when provider='openai' and apiKey is present", () => {
    mockGetAISettings.mockReturnValue({ provider: 'openai', apiKey: 'sk-openai-xyz' });
    const r = getAIReadiness();
    expect(r.state).toBe('ready');
    expect(r.canRun).toBe(true);
  });

  it("returns state='ready' for provider='custom' even without apiKey", () => {
    mockGetAISettings.mockReturnValue({ provider: 'custom', apiKey: '' });
    const r = getAIReadiness();
    expect(r.state).toBe('ready');
    expect(r.canRun).toBe(true);
  });

  it("returns state='ready' for provider='custom' with an apiKey set", () => {
    mockGetAISettings.mockReturnValue({ provider: 'custom', apiKey: 'local-key' });
    const r = getAIReadiness();
    expect(r.state).toBe('ready');
    expect(r.canRun).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------

describe('getAIReadiness — structural invariants', () => {
  it('canRun is true only when state is ready', () => {
    const cases = [
      { provider: 'none', apiKey: '', expectedCanRun: false },
      { provider: 'gemini', apiKey: '', expectedCanRun: false },
      { provider: 'gemini', apiKey: 'key', expectedCanRun: true },
      { provider: 'custom', apiKey: '', expectedCanRun: true },
    ] as const;

    for (const { provider, apiKey, expectedCanRun } of cases) {
      mockGetAISettings.mockReturnValue({ provider, apiKey });
      const r = getAIReadiness();
      expect(r.canRun).toBe(expectedCanRun);
      expect(r.canRun).toBe(r.state === 'ready');
    }
  });

  it('hint is empty string only when state is ready', () => {
    mockGetAISettings.mockReturnValue({ provider: 'gemini', apiKey: 'key' });
    expect(getAIReadiness().hint).toBe('');

    mockGetAISettings.mockReturnValue({ provider: 'none', apiKey: '' });
    expect(getAIReadiness().hint.length).toBeGreaterThan(0);

    mockGetAISettings.mockReturnValue({ provider: 'gemini', apiKey: '' });
    expect(getAIReadiness().hint.length).toBeGreaterThan(0);
  });
});
