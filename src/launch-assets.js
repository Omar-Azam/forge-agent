// src/launch-assets.js — Launch materials generator for Forge Agent
'use strict';

const PRODUCT_HUNT_TAGLINE = 'Autonomous AI coding agent — no API key, completely free';

const PRODUCT_HUNT_DESCRIPTION = `Forge Agent is an open-source autonomous AI coding agent that drives web-based AI assistants like DeepSeek, ChatGPT, and Gemini via browser automation.

The problem with most AI coding tools today is the "AI Tax." Serious automation usually requires expensive monthly subscriptions or pay-per-task API keys. This creates a barrier for students, hobbyists, and developers who want to experiment without a credit card.

Forge Agent takes a different approach: it drives the free web UI just like a human would. You give it a task in plain English, and it autonomously reads your files, writes code, runs tests, and debugs errors until the job is done.

Key Features:
- 37+ Built-in Tools: Comprehensive filesystem, Git, and process management.
- Multi-Model: Seamlessly swap between DeepSeek, ChatGPT, and Gemini.
- Enterprise-Ready: Full Docker support, security sandbox, and audit logging.
- Intelligent Logic: Context compression, smart truncation, and task planning.
- Proven Stability: Over 1150 automated tests ensuring reliability across platforms.

Whether you're scaffolding a new REST API, refactoring a legacy codebase, or just automating the "boring stuff," Forge Agent gives you state-of-the-art AI assistance for $0.

We've spent 48 days hardening this engine and we're excited to see what you build with it!`;

const HACKER_NEWS_TITLE = 'Show HN: Forge Agent – Autonomous AI Coding Agent, No API Key Required';

function generateHackerNewsPost() {
  return `Hi HN,

I built Forge Agent, an autonomous AI coding agent that drives web-based AI assistants (DeepSeek, ChatGPT, Gemini) via browser automation.

The main motivation was to remove the "API key barrier." Most autonomous agents require a paid API key, which can get expensive quickly. Since the free web interfaces are already world-class, I thought: why not just drive the browser?

Technical approach:
Forge Agent is built in Node.js and uses Playwright to drive a persistent, logged-in browser session. It has a 6-strategy parser that extracts tool calls from the AI's prose. These tools (37+ built-in) execute on your local filesystem, and the results are fed back to the AI, creating a continuous autonomous loop.

Key features:
1. No API keys needed — uses free web interfaces.
2. 37+ tools for file I/O, Git, shell commands, and semantic search.
3. Multi-model support — swap AIs with a single CLI flag.
4. Robust sandbox — protected paths and symlink escape detection.
5. Docker support — run it in an isolated container with one command.

Limitations:
- It relies on browser automation, so it can be affected by UI changes (though we have a --calibrate tool to fix selectors).
- It's slower than direct API calls due to page load times.
- Complex tasks still require good prompt engineering.

I've been working on this for 48 days and have written over 1150 tests to keep it stable. It's fully open source (MIT).

I'd love to hear your thoughts on the browser-automation approach vs. direct APIs, and any feedback on the toolset!

GitHub: https://github.com/Omar-Azam/forge-agent`;
}

const TWITTER_THREAD = [
  `1/ I built a free autonomous AI coding agent that requires NO API key. 🤖

You give it a task in plain English, and it builds the code — reads files, writes logic, runs tests, and fixes bugs autonomously. 

Here's how it works 🧵`,
  
  `2/ The problem: AI coding tools are powerful but expensive. $10-20/month for Copilot or Cursor adds up. 💸

Not everyone can afford paid API keys or subscriptions just to experiment with AI automation.`,
  
  `3/ The solution: Forge Agent. 🔨

It drives DeepSeek, ChatGPT, and Gemini's FREE web interfaces via browser automation using Playwright. 

Same state-of-the-art AI, zero API cost.`,
  
  `4/ How it works:
1. Give it a task: forge-agent "build a REST API"
2. Agent opens browser & sends context
3. AI returns tool calls
4. Agent executes tools locally (Git, Shell, Files)
5. Results feed back to AI loop

Repeat until done. ✅`,
  
  `5/ It’s not a toy. We've spent 48 days building a robust engine:
🛠️ 37+ built-in tools
🧠 Agent profiles & planning
📦 Docker support
🔒 Security sandbox
🧪 1150+ automated tests

Cross-platform: Linux, macOS, Windows.`,
  
  `6/ Want to try it? It's live on npm! 🚀

npm install -g @omar-azam/forge-agent

Star the repo on GitHub:
https://github.com/Omar-Azam/forge-agent`,
  
  `7/ Forge Agent is 100% open source (MIT). 💙

Built in 48 days of public development. I'd love your feedback and PRs. What features should we add next? 

#OpenSource #AI #NodeJS #DevTools`,
];

const LINKEDIN_POST = `After 48 days of intensive development, I'm excited to finally share Forge Agent! 🚀

Forge Agent is an autonomous AI coding agent that requires NO API keys. 

AI coding tools are transforming our industry, but they often come with a heavy "AI Tax." Whether it's a monthly subscription or pay-per-token API fees, the cost of entry for autonomous agents is high. 

I wanted to build something that makes this power accessible to everyone — students, hobbyists, and developers worldwide. 

The approach is unconventional: Forge Agent uses Playwright to drive the free web interfaces of DeepSeek, ChatGPT, and Gemini. It handles the browser automation, session management, and response parsing, so you get the power of an autonomous agent for free.

Key Stats:
🛠️ 37+ Built-in Tools (Files, Git, Shell, Search)
🧪 1150+ Automated Tests
📦 Production-ready Docker Support
🔒 Built-in Security Sandbox

How to get started:
npm install -g @omar-azam/forge-agent
forge-agent "build a REST API with Express"

Forge Agent is fully open source (MIT). I'm looking for feedback, contributors, and new tool ideas!

Check it out on GitHub: https://github.com/Omar-Azam/forge-agent

#OpenSource #AITools #NodeJS #DeveloperTools #Automation #AI`;

const DEV_TO_POST = `## The Problem with AI Coding Tools Today

AI coding assistants like GitHub Copilot and Cursor are amazing, but they have a recurring cost. If you want to use autonomous agents like Devin or OpenDevin, you're looking at even higher costs via direct API keys. This "AI Tax" makes it hard for many developers to truly experiment with agentic workflows.

## The Unconventional Solution: Browser Automation

What if we stopped calling APIs and started driving the UI? DeepSeek, ChatGPT, and Gemini all offer world-class models for free via their web interfaces. They just don't offer a free API.

Forge Agent is built on the simple idea that a browser doesn't care if a human or a program is clicking the buttons. By using Playwright to drive a headless browser, we can give any developer access to an autonomous coding agent with zero API cost.

## How Forge Agent Works

The core loop is simple but powerful:
1. **User Input:** You provide a task via the CLI.
2. **Context:** The agent gathers project context (file structure, tech stack).
3. **Browser Loop:** It sends the task to the AI web UI.
4. **Parsing:** A 6-strategy engine extracts tool calls from the AI's response.
5. **Execution:** Tools execute on your local machine (writing files, running tests).
6. **Feedback:** Results go back to the AI.

## Key Features

- **37+ Built-in Tools:** Everything from Git integration and semantic search to process management.
- **Multi-Model Support:** Swap between DeepSeek, ChatGPT, and Gemini with one flag.
- **Docker Ready:** Run the agent in a perfectly isolated environment.
- **Security First:** A robust sandbox prevents the agent from touching sensitive paths like SSH keys.

## Getting Started

Installation is easy:
\`\`\`bash
npm install -g @omar-azam/forge-agent
forge-agent --setup
\`\`\`

Then, run your first task:
\`\`\`bash
forge-agent "refactor the auth middleware to use JWT"
\`\`\`

## The Technical Details

Built in Node.js, the agent is designed for stability. We've written over 1150 tests covering everything from DOM selector health to complex path traversal attacks. It supports agent profiles (backend, frontend, devops) and persistent project memory.

## Limitations and Known Issues

Because it relies on browser automation, it's inherently slower than an API and can be sensitive to UI updates from the AI providers. However, we've built a \`--calibrate\` tool to auto-fix selectors in seconds.

## What's Next

Our 2026 roadmap includes:
- Local model support via Ollama.
- Multi-agent coordination.
- A full GUI desktop application.

## Contributing

Forge Agent is 100% open source. We'd love your help building more tools and improving the parser.

GitHub: [https://github.com/Omar-Azam/forge-agent](https://github.com/Omar-Azam/forge-agent)`;

function generateLaunchKit() {
  return {
    productHunt: {
      tagline: PRODUCT_HUNT_TAGLINE,
      description: PRODUCT_HUNT_DESCRIPTION,
      topics: ['Developer Tools', 'Artificial Intelligence', 'Open Source', 'Productivity', 'Node.js'],
      firstComment: "Hi Hunters! I built Forge Agent because I was tired of paying for API keys just to play with autonomous agents. It's been a 48-day journey to make browser-based agents stable enough for real work, and I'm excited to finally share it with you all!",
      gallery: [
        'Terminal showing forge-agent running a task',
        'Before/after: task prompt vs generated code',
        'forge-agent --history output showing past tasks',
        'forge-agent --profile=backend in action',
      ]
    },
    hackerNews: {
      title: HACKER_NEWS_TITLE,
      body: generateHackerNewsPost(),
      url: 'https://github.com/Omar-Azam/forge-agent',
    },
    twitter: {
      thread: TWITTER_THREAD,
      hashTags: ['#OpenSource', '#AITools', '#NodeJS', '#DevTools'],
    },
    linkedin: {
      post: LINKEDIN_POST,
    },
    devTo: {
      title: "I Built a Free Autonomous AI Coding Agent — No API Key Required",
      tags: ['opensource', 'ai', 'node', 'productivity'],
      body: DEV_TO_POST,
    },
  };
}

function formatLaunchAsset(key, asset) {
  const boxWidth = 60;
  const line = '─'.repeat(boxWidth);
  const boxLine = '═'.repeat(boxWidth - 2);
  const title = `${key.toUpperCase()}`.padEnd(boxWidth - 4);
  
  let content = '';
  if (typeof asset === 'string') {
    content = asset;
  } else if (Array.isArray(asset)) {
    content = asset.join('\n\n');
  } else if (typeof asset === 'object') {
    content = Object.entries(asset).map(([k, v]) => {
        if (Array.isArray(v)) return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
        return `${k}: ${v}`;
    }).join('\n\n');
  }

  return [
    `╔${boxLine}╗`,
    `║ ${title} ║`,
    `╚${boxLine}╝`,
    content,
    line,
    '',
  ].join('\n');
}

function formatAllLaunchAssets() {
  const kit = generateLaunchKit();
  return Object.entries(kit).map(([key, asset]) => formatLaunchAsset(key, asset)).join('\n');
}

module.exports = {
  PRODUCT_HUNT_TAGLINE,
  PRODUCT_HUNT_DESCRIPTION,
  HACKER_NEWS_TITLE,
  generateHackerNewsPost,
  TWITTER_THREAD,
  LINKEDIN_POST,
  DEV_TO_POST,
  generateLaunchKit,
  formatLaunchAsset,
  formatAllLaunchAssets,
};
