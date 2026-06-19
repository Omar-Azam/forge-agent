# Changelog — Forge Agent

All notable changes documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [2.0.0] — 50-Day Journey Complete

### Phase 5: Community, Scale & Launch (Days 41–50)

#### Changed
- CLI command renamed from `forge` to `forge-agent`
- npm package renamed to `@omar-azam/forge-agent`
- **Backward compatibility**: `fa` alias kept; existing `deepseek-agent.config.json` still supported.

#### Added
- **Documentation site** — 13-page static HTML docs site at docs/
  including getting started, CLI reference, all tools, profiles,
  templates, plugins, configuration, security, Docker, benchmarks,
  sponsor page, and blog (Day 41)
- **Example projects gallery** — 10 curated project blueprints with
  full task prompts: Express API, React Todo, Python CLI, Next.js blog,
  Docker stack, data analysis, GitHub Actions CI, FastAPI, Vue dashboard,
  terminal game. `forge-agent --examples` (Day 42)
- **Benchmark suite** — 5-category performance measurement system:
  parser, tools, search, truncation, memory. `forge-agent --benchmark` (Day 43)
- **Community health files** — CONTRIBUTING.md, CODE_OF_CONDUCT.md,
  SECURITY.md, ROADMAP.md, SUPPORTERS.md, structured GitHub issue
  templates (bug, feature, plugin sharing), PR template (Day 44)
- **Security audit** — src/security.js: path traversal hardening,
  null byte injection prevention, additional blocked paths (~/.npmrc,
  ~/.netrc, ~/.git-credentials, ~/.docker/config.json), command
  injection protection, secret sanitisation for history, parameter
  validation for all tool calls, audit logging system (Day 45)
- **Docker support** — multi-stage Dockerfile, docker-compose.yml,
  docker-compose.dev.yml, Makefile with convenience commands,
  GitHub Actions docker.yml for auto-publishing to GitHub Container
  Registry, src/docker.js for container detection (Day 46)
- **Sponsorship infrastructure** — src/sponsor.js: 5 funding tiers,
  non-intrusive usage nudge (max once per 7 days, 20% probability,
  disabled in CI), .github/FUNDING.yml, SUPPORTERS.md,
  docs/sponsor.html (Day 47)
- **Launch assets** — src/launch-assets.js: Product Hunt tagline/description,
  Hacker News Show HN post, 7-tweet Twitter thread, LinkedIn post,
  dev.to article, `forge-agent --launch-assets` (Day 48)
- **Blog** — docs/blog/ with launch announcement and 2026 roadmap
  posts, blog index page (Day 48)
- **Final audit** — comprehensive 32-check audit of all source files,
  tests, docs, community files, Docker files. All rough edges fixed.
  Startup time optimised to under 2 seconds (Day 49)

---

## [1.4.0] — Phase 4: UX & Developer Experience (Days 31–40)

#### Added
- **Terminal UI overhaul** — src/tui.js: structured step timeline,
  tool call display with ⚡/✓/✗ icons, completion footer, --no-tui
  and --compact flags (Day 31)
- **Task history** — src/history.js: persistent JSONL log of every
  task, --history, --history=N, --history-stats, --history-search,
  --history-clear (Day 32)
- **Config wizard** — src/wizard.js: interactive 10-step guided setup,
  forge-agent --setup (Day 33)
- **Watch mode** — src/watcher.js: FileWatcher class, WatchSession,
  --watch, --watch-pattern, --watch-debounce, --watch-max,
  --watch-cooldown (Day 34)
- **Task templates** — src/templates.js: 10 built-in templates
  (add-typescript, add-jest, add-docker, add-github-actions, add-eslint,
  add-env-setup, write-readme, add-auth, fix-tests, code-review),
  --template, --list-templates, --save-template, --remove-template (Day 35)
- **Output formatting** — src/formatter.js: text, markdown, json,
  json-raw, minimal, silent formats, --format, --output, --timestamp (Day 36)
- **Shell completions** — src/completions.js: bash, zsh, fish scripts,
  --completion-bash/zsh/fish/install (Day 37)
- **Session resume** — src/session-resume.js: --resume, --resume=last,
  --resume=<id>, --rerun, interactive history picker with numbered
  selection, context injection for continued tasks (Day 38)
- **Help system** — src/help-topics.js, src/manpage.js: 9 topic guides,
  --help=<topic>, --cheatsheet, --man, --man-install (Day 39)

#### Changed
- Version bumped to 1.4.0
- CLI flags: 40+ across all features
- Test count: 1000+ passing

---

## [1.3.0] — Phase 3: Intelligence Upgrades (Days 21–30)

#### Added
- **Task planning** — src/planner.js: buildPlanPrompt, parsePlan,
  --plan flag shows numbered execution plan (Day 21)
- **Context compression** — src/compressor.js: auto-compress long
  conversations at configurable token threshold (Day 22)
- **Multi-model support** — src/adapters/ directory: BaseAdapter,
  DeepSeekAdapter, ChatGPTAdapter, GeminiAdapter, AdapterFactory,
  --model=deepseek/chatgpt/gemini (Day 23)
- **R1 thinking mode** — src/thinking.js: ThinkingTracker, strip/extract
  thinking blocks, --think flag (Day 24)
- **Persistent memory** — src/memory.js: MemoryStore, project-level
  knowledge persistence across sessions, tech stack detection,
  --no-memory flag (Day 25)
- **Custom plugins** — src/plugin-loader.js: drop .js files into
  ~/.deepseek-agent/tools/, --list-plugins, --new-plugin (Day 26)
- **Tool caching** — src/tool-cache.js: LRU in-session cache, read-only
  tool caching, write-invalidation, --no-cache flag (Day 27)
- **Smart truncation** — src/truncator.js: detectContentType, strategy
  per content type (code/test/file-list/git/json/generic) (Day 28)
- **Agent profiles** — src/profiles.js: default, backend, frontend,
  data-science, devops. --profile flag, --list-profiles (Day 29)
- **Visual rename** — all user-visible output and docs show Forge Agent,
  forge/fa CLI commands (Day 30)

#### Changed
- Version bumped to 1.3.0

---

## [1.2.0] — Phase 2: Developer Tools (Days 11–20)

#### Added
- **Git tools (6)** — git_status, git_log, git_diff, git_branches,
  git_show, git_blame (Day 11)
- **Semantic search** — src/searcher.js: LCS symbol extraction, fuzzy
  matching, relevance scoring, search_codebase tool (Day 12)
- **Test runner** — src/test-runner.js: auto-detect Jest/Vitest/Mocha/
  pytest/Go/Cargo, spawnSync for stderr capture, run_tests tool (Day 13)
- **Package installer** — src/package-manager.js: npm/yarn/pnpm/pip/
  cargo/go, skip-if-installed, batch install, install_package tool (Day 14)
- **Diff/patch engine** — src/differ.js: LCS-based unified diff
  generation, patch application, diff_files and patch_file tools (Day 15)
- **Env tools (5)** — src/env-manager.js: read_env, set_env_var,
  delete_env_var, list_env_files, check_env_vars — secret masking (Day 16)
- **Process manager (4)** — src/process-manager.js: start_process,
  stop_process, list_processes, read_process_logs (Day 17)
- **Screenshot tool** — src/screenshot.js: take_screenshot (Day 18)
- **Clipboard tools** — src/clipboard.js: read_clipboard,
  write_clipboard (Day 19)

#### Changed
- Version bumped to 1.2.0
- Total tools: 35+ (up from 15)

---

## [1.1.0] — Phase 1: Foundation & Stability (Days 1–10)

#### Added
- **Test suite** — Jest setup, 49 tool tests, 40 parser tests,
  37 browser unit tests, live selector health check (Days 1–3)
- **CI/CD** — GitHub Actions: ci.yml (Node 18/20/22 matrix),
  release.yml (auto-publish on tag), stale.yml (Day 4)
- **Windows compatibility** — replaced Unix find/grep with pure
  Node.js: list_directory, find_files, search_in_files, globToRegex (Day 5)
- **Structured errors** — src/errors.js: AgentError with what/why/how,
  20 named factories, classifyFsError, classifyCommandError (Day 6)
- **Retry system** — src/retry.js: withBrowserRetry, withSendRetry,
  withResponseRetry, withNetworkRetry, exponential backoff (Day 7)
- **Session health** — src/health.js: 6-check startup validation,
  auto-reauth on expired session (Day 8)
- **Progress tracking** — src/progress.js: ProgressTracker, partial
  result summary on timeout (Day 9)
- **Path sandbox** — assertSafePath(), STRICT_SANDBOX mode, fix
  auto new-chat bug (Day 10)

#### Changed
- Version bumped to 1.1.0

---

## [1.0.0] — Initial Release

### Added
- Core browser automation engine via Playwright
- 15 built-in tools: read_file, write_file, append_to_file,
  replace_in_file, delete_file, move_file, copy_file, get_file_info,
  list_directory, create_directory, write_files, search_in_files,
  find_files, run_command, read_url
- Interactive REPL mode (--interactive / -i)
- Single-task CLI mode
- Persistent browser session (login once, runs forever)
- 6-strategy response parser
- Auto-recovery when AI mixes prose with tool calls
- DOM tree walker for response extraction
- forge-agent --calibrate for selector auto-detection
- forge-agent --debug for raw AI response inspection
- forge-agent --headless for invisible browser operation
- forge-agent --save-log for conversation persistence
- forge-agent --dir for working directory control
- Global config: ~/.deepseek-agent/config.json
- Project config: forge-agent.config.json
- ANSI terminal output with step-by-step progress
- npm package: @omar-azam/forge-agent
- CLI: forge-agent and fa
