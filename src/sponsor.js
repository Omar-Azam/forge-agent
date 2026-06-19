// src/sponsor.js — Sponsorship nudge system for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SPONSOR_URLS = {
  github:        'https://github.com/sponsors/Omar-Azam',
  openCollective: 'https://opencollective.com/forge-agent',
  kofi:          'https://ko-fi.com/forgeagent',
  buyMeACoffee:  'https://buymeacoffee.com/forgeagent',
  docs:          'https://forge-agent.dev/sponsor',
};

const SPONSOR_TIERS = [
  {
    name: 'Coffee',
    amount: '$5/month',
    description: 'Buy the maintainer a coffee',
    perks: ['Name in SUPPORTERS.md', 'Thank you in release notes'],
    icon: '☕',
  },
  {
    name: 'Supporter',
    amount: '$10/month',
    description: 'Support ongoing development',
    perks: ['All Coffee perks', 'Priority issue response', 'Supporter badge in discussions'],
    icon: '⭐',
  },
  {
    name: 'Builder',
    amount: '$25/month',
    description: 'Help fund new features',
    perks: ['All Supporter perks', 'Vote on roadmap items', 'Monthly dev update email'],
    icon: '🔧',
  },
  {
    name: 'Team',
    amount: '$100/month',
    description: 'For teams using Forge Agent in production',
    perks: ['All Builder perks', 'Logo in README', 'Priority support channel', 'Custom plugin review'],
    icon: '🏢',
  },
  {
    name: 'Enterprise',
    amount: 'Custom',
    description: 'Enterprise support and custom development',
    perks: ['All Team perks', 'SLA-backed support', 'Custom feature development', 'Private Slack channel'],
    icon: '🚀',
  },
];

class SponsorNudge {
  constructor(historyStore, config) {
    this.historyStore = historyStore;
    this.config = config;
    this.nudgeFile = config.SPONSOR_NUDGE_FILE || path.join(os.homedir(), '.deepseek-agent', 'sponsor-nudge.json');
  }

  shouldShowNudge() {
    try {
      if (this.config.DISABLE_SPONSOR_NUDGE) return false;
      if (process.env.CI) return false;
      if (['json', 'silent'].includes(this.config.OUTPUT_FORMAT)) return false;

      if (!this.historyStore) return false;
      const stats = this.historyStore.getStats();
      if (stats.completedTasks < 10) return false;

      const lastNudge = this.getLastNudgeDate();
      if (lastNudge) {
        const diffDays = (new Date() - lastNudge) / (1000 * 60 * 60 * 24);
        if (diffDays < 7) return false;
      }

      // 20% random chance to prevent annoyance
      return Math.random() < 0.2;
    } catch (err) {
      return false;
    }
  }

  recordNudgeShown() {
    try {
      const data = this._loadNudgeData();
      data.lastShown = new Date().toISOString();
      data.showCount = (data.showCount || 0) + 1;

      fs.mkdirSync(path.dirname(this.nudgeFile), { recursive: true });
      fs.writeFileSync(this.nudgeFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // ignore
    }
  }

  getLastNudgeDate() {
    const data = this._loadNudgeData();
    if (data && data.lastShown) {
      const date = new Date(data.lastShown);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  _loadNudgeData() {
    try {
      if (fs.existsSync(this.nudgeFile)) {
        return JSON.parse(fs.readFileSync(this.nudgeFile, 'utf8'));
      }
    } catch (err) {
      // ignore
    }
    return {};
  }

  formatNudgeMessage() {
    const line = '─'.repeat(57);
    return [
      line,
      '💙 Enjoying Forge Agent? Consider supporting development.',
      '',
      '   Forge Agent is free and open source. If it saves you',
      '   time, a small sponsorship helps keep it maintained.',
      '',
      '   ☕ $5/mo  →  github.com/sponsors/Omar-Azam',
      '   ⭐ $10/mo →  ko-fi.com/forgeagent',
      '   🏢 Teams  →  forge-agent.dev/sponsor',
      '',
      '   To disable this message: forge-agent --no-sponsor-nudge',
      line,
    ].join('\n');
  }

  formatSponsorPage() {
    const line = '─'.repeat(60);
    const boxLine = '═'.repeat(62);
    
    return [
      `╔${boxLine}╗`,
      `║  💙 Support Forge Agent                                       ║`,
      `╚${boxLine}╝`,
      '',
      'Forge Agent is free, open-source software. 47 days of development,',
      '1130+ automated tests, full Docker support, and a complete',
      'documentation site — all maintained by one developer.',
      '',
      'Your sponsorship funds:',
      '  • New tools and features',
      '  • Bug fixes and reliability improvements',
      '  • Documentation and examples',
      '  • Security audits',
      '  • Community support',
      '',
      'SPONSORSHIP TIERS',
      line,
      ...SPONSOR_TIERS.map(t => `${t.icon} ${t.name.padEnd(10)} ${t.amount.padEnd(8)} — ${t.perks[0]}`),
      '',
      'WAYS TO SPONSOR',
      line,
      `GitHub Sponsors:  ${SPONSOR_URLS.github}`,
      `Ko-fi:            ${SPONSOR_URLS.kofi}`,
      `Open Collective:  ${SPONSOR_URLS.openCollective}`,
      `Buy Me a Coffee:  ${SPONSOR_URLS.buyMeACoffee}`,
      '',
      'OTHER WAYS TO HELP (free!)',
      line,
      '⭐ Repo star:      https://github.com/Omar-Azam/forge-agent',
      '📢 Share Forge Agent with your team or on social media',
      '🐛 Report bugs:   https://github.com/Omar-Azam/forge-agent/issues',
      '📝 Improve docs:  Open a PR with documentation improvements',
      '🔌 Share plugins: Share your custom plugins in GitHub Discussions',
    ].join('\n');
  }
}

function showNudgeIfAppropriate(historyStore, config, logger) {
  try {
    const nudge = new SponsorNudge(historyStore, config);
    if (nudge.shouldShowNudge()) {
      console.log('\n' + nudge.formatNudgeMessage() + '\n');
      nudge.recordNudgeShown();
    }
  } catch (err) {
    // never crash the agent for a nudge
  }
}

module.exports = {
  SPONSOR_URLS,
  SPONSOR_TIERS,
  SponsorNudge,
  showNudgeIfAppropriate,
};
