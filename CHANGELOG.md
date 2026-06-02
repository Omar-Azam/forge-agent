# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-05-05 — Phase 1: Foundation & Stability

### Added
- **Test suite** — 333 automated tests across 9 test files (Days 1–3)
  - `tests/tools.test.js` — 49 tests covering all 15 tools end-to-end
  - `tests/parser.test.js` — 40 tests covering all 6 parser strategies with real DeepSeek output samples
  - `tests/browser.test.js` — 37 unit tests with full Playwright mocking
  - `tests/selector-health-check.js` — Live selector validator (not part of `npm test`, run manually)
- **CI pipeline** — GitHub Actions workflows (Day 4)
  - `ci.yml` — Runs `npm test` on every push and PR across Node 18, 20, 22
  - `release.yml` — Auto-publishes to npm when a version tag is pushed
  - `stale.yml` — Auto-closes inactive issues after 37 days
  - PR template and issue templates (bug report, feature request)
- **Windows compatibility** — All tools now use pure Node.js (Day 5)
  - `list_directory` (recursive) rewritten from `find` shell command to `fs.readdirSync` walker
  - `find_files` rewritten from `find` shell command to regex-based Node.js walker with `globToRegex()`
  - `search_in_files` rewritten from `grep` to pure Node.js file walker with binary file detection
  - `tests/windows-compat.test.js` — 32 cross-platform tests
- **Structured error system** — `src/errors.js` with what/why/how format (Day 6)
  - 20 named error factories covering filesystem, commands, browser, tools, network, and config failures
  - `classifyFsError()` and `classifyCommandError()` auto-classify raw Node.js errors
  - `displayError()` formats errors beautifully in the terminal
  - `tests/errors.test.js` — 51 tests
- **Retry system** — `src/retry.js` with exponential backoff (Day 7)
  - `withBrowserRetry`, `withSendRetry`, `withResponseRetry`, `withNetworkRetry` wrappers
  - `isRetryable()` classifies 16 error types automatically
  - `sendMessage` and `waitForResponse` now retry on transient failures
  - `read_url` retries on network errors and HTTP 5xx responses
  - `tests/retry.test.js` — 35 tests
- **Session health check** — `src/health.js` runs 6 checks on startup (Day 8)
  - Checks: page loaded, logged in, input available, rate limited, network, maintenance
  - Prints colour-coded health table before first task
  - Auto-prompts re-login if session expired, re-verifies after login
  - `tests/health.test.js` — 35 tests
- **Progress tracker** — `src/progress.js` tracks every step for graceful timeout (Day 9)
  - Records all tool calls, file writes, commands run, and errors
  - `buildPartialSummary()` generates a structured report of what was completed
  - `getStatusLine()` shows live progress on each iteration
  - `tests/progress.test.js` — 42 tests
- **Path sandbox** — `assertSafePath()` in `src/tools.js` (Day 10)
  - Blocks access to sensitive paths: `/etc/passwd`, `~/.ssh`, `~/.aws`, `~/.gnupg`
  - `STRICT_SANDBOX` config option blocks ALL access outside working directory
  - Security errors are marked non-retryable so they fail immediately

### Fixed
- **Auto new-chat bug** — Interactive mode no longer starts a new DeepSeek chat between
  every task. The AI now retains context across consecutive tasks in the same session.
  Type `new` explicitly to reset the chat. (Day 10)
- **`_cleanText` regex** — Copy-code button artifacts (`1CopyRunInsert`) now stripped
  correctly using `\w*` instead of `\b` which failed on camelCase strings. (Day 3)
- **Empty response handling** — Three consecutive empty responses now trigger a new-chat
  recovery instead of crashing. (Day 7)
- **Working directory listing** — Replaced Unix `find` shell command with pure Node.js
  walker, fixing Windows compatibility and removing shell injection surface. (Day 9)

### Changed
- `waitForResponse` now throws a retryable error on empty response instead of returning
  empty string, so `withResponseRetry` can handle it automatically.
- Max-iterations now returns a partial result summary instead of a bare warning message.
- Browser launch now runs the full health check instead of a single login check.

---

## [1.0.1] — 2026-05-03

### Fixed
- npm publish authentication (granular access token setup)

---

## [1.0.0] — 2026-05-03 — Initial Release

### Added
- Browser automation via Playwright targeting chat.deepseek.com
- 15 built-in tools: file read/write/append/replace/delete/move/copy,
  directory listing/creation, shell commands, file search, grep, URL fetching,
  and batch file writing
- Interactive REPL mode (`--interactive` / `-i`)
- Single-task CLI mode
- Persistent browser session (login once, runs forever)
- 6-strategy response parser handling fenced code blocks, JSON blocks, XML,
  DOM-stripped XML, bare JSON, and Python-style function calls
- DOM tree walker that reconstructs backtick fences from `<pre><code>` elements
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

### Planned (Phase 2 — Days 11–20)
- Git integration tool
- Multi-file semantic search
- Test runner tool (jest/pytest/etc.)
- Package installer tool
- Diff and patch tool
- Environment variables tool
- Process manager
- Screenshot tool
