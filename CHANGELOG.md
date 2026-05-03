# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2025-05-03

### Added
- Initial public release
- Browser automation via Playwright targeting chat.deepseek.com
- 15 built-in tools: file read/write/append/replace/delete/move/copy, directory listing/creation, shell commands, file search, grep, URL fetching, and batch file writing
- Interactive REPL mode (`--interactive` / `-i`)
- Single-task CLI mode
- Persistent browser session (login once, runs forever)
- 6-strategy response parser handling fenced code blocks, JSON blocks, XML, DOM-stripped XML, bare JSON, and Python-style function calls
- DOM tree walker that reconstructs backtick fences from `<pre><code class="language-*">` elements
- Auto-recovery when AI mixes prose with tool calls
- `--calibrate` tool for auto-detecting DOM selectors after UI changes
- `--debug` flag for inspecting raw AI responses
- `--headless` flag for invisible browser operation
- `--save-log` flag for persisting conversation logs
- `--dir` flag for setting working directory
- Global config via `~/.deepseek-agent/config.json`
- Per-project config via `deepseek-agent.config.json`
- `dsa` short alias
- `postinstall` script for automatic Chromium download
- ANSI-colored terminal output with step-by-step progress display

---

## [Unreleased]

### Planned
- Automated test suite
- Windows path compatibility improvements
- Better selector resilience for DeepSeek UI changes
- Support for additional AI frontends
- Plugin / custom tool system
