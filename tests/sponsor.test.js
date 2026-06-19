// tests/sponsor.test.js
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { SPONSOR_URLS, SPONSOR_TIERS, SponsorNudge, showNudgeIfAppropriate } = require('../src/sponsor');

describe('Sponsorship Module', () => {
  const nudgeFile = path.join(os.tmpdir(), 'forge-agent-sponsor-test.json');
  const config = {
    SPONSOR_NUDGE_FILE: nudgeFile,
    DISABLE_SPONSOR_NUDGE: false,
    OUTPUT_FORMAT: 'text'
  };

  afterEach(() => {
    try { if (fs.existsSync(nudgeFile)) fs.unlinkSync(nudgeFile); } catch {}
  });

  test('SPONSOR_URLS is exported and has required keys', () => {
    expect(SPONSOR_URLS).toHaveProperty('github');
    expect(SPONSOR_URLS).toHaveProperty('openCollective');
    expect(SPONSOR_URLS).toHaveProperty('kofi');
  });

  test('SPONSOR_TIERS has exactly 5 tiers with required fields', () => {
    expect(SPONSOR_TIERS.length).toBe(5);
    SPONSOR_TIERS.forEach(tier => {
      expect(tier).toHaveProperty('name');
      expect(tier).toHaveProperty('amount');
      expect(tier).toHaveProperty('description');
      expect(tier).toHaveProperty('perks');
      expect(tier).toHaveProperty('icon');
      expect(Array.isArray(tier.perks)).toBe(true);
      expect(tier.perks.length).toBeGreaterThan(0);
    });
  });

  describe('SponsorNudge', () => {
    const mockHistory = {
      getStats: () => ({ completedTasks: 15 })
    };

    test('shouldShowNudge returns false when disabled in config', () => {
      const nudge = new SponsorNudge(mockHistory, { ...config, DISABLE_SPONSOR_NUDGE: true });
      expect(nudge.shouldShowNudge()).toBe(false);
    });

    test('shouldShowNudge returns false in CI environment', () => {
      const originalCi = process.env.CI;
      process.env.CI = 'true';
      const nudge = new SponsorNudge(mockHistory, config);
      expect(nudge.shouldShowNudge()).toBe(false);
      process.env.CI = originalCi;
    });

    test('shouldShowNudge returns false for JSON output format', () => {
      const nudge = new SponsorNudge(mockHistory, { ...config, OUTPUT_FORMAT: 'json' });
      expect(nudge.shouldShowNudge()).toBe(false);
    });

    test('shouldShowNudge returns false if user has < 10 completed tasks', () => {
      const poorHistory = { getStats: () => ({ completedTasks: 5 }) };
      const nudge = new SponsorNudge(poorHistory, config);
      expect(nudge.shouldShowNudge()).toBe(false);
    });

    test('recordNudgeShown creates file and getLastNudgeDate returns it', () => {
      const nudge = new SponsorNudge(mockHistory, config);
      nudge.recordNudgeShown();
      expect(fs.existsSync(nudgeFile)).toBe(true);
      
      const lastDate = nudge.getLastNudgeDate();
      expect(lastDate).toBeInstanceOf(Date);
      // It should be very recent
      expect(new Date() - lastDate).toBeLessThan(10000);
    });

    test('shouldShowNudge returns false if shown less than 7 days ago', () => {
      const nudge = new SponsorNudge(mockHistory, config);
      nudge.recordNudgeShown();
      // Even if random chance passes, it should be false due to cooldown
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.01);
      expect(nudge.shouldShowNudge()).toBe(false);
      spy.mockRestore();
    });

    test('formatNudgeMessage returns string with key info', () => {
      const nudge = new SponsorNudge(mockHistory, config);
      const msg = nudge.formatNudgeMessage();
      expect(typeof msg).toBe('string');
      expect(msg).toContain('github.com/sponsors');
      expect(msg).toContain('--no-sponsor-nudge');
    });

    test('formatSponsorPage returns full info string', () => {
      const nudge = new SponsorNudge(mockHistory, config);
      const page = nudge.formatSponsorPage();
      expect(page).toContain('Support Forge Agent');
      expect(page).toContain('Coffee');
      expect(page).toContain('Enterprise');
      expect(page).toContain('GitHub Sponsors');
    });
  });

  test('showNudgeIfAppropriate does not throw', () => {
    expect(() => showNudgeIfAppropriate(null, config, console)).not.toThrow();
  });
});
