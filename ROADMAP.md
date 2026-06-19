# 🔨 Forge Agent — Roadmap

## Current Version: 2.0.0

Forge Agent is an autonomous AI coding agent that drives web-based AI assistants via browser automation. This roadmap outlines the major milestones achieved and the planned future directions for the project.

## Recently Completed (v1.0.0 → v2.0.0)

List major milestones achieved:
- ✅ **Core Engine:** Autonomous browser automation using Playwright.
- ✅ **Toolbox:** 37+ built-in tools for file I/O, Git, shell, testing, and more.
- ✅ **Multi-Model:** Support for DeepSeek, ChatGPT, and Gemini.
- ✅ **Agent Profiles:** Specialized modes for `backend`, `frontend`, `data-science`, and `devops`.
- ✅ **Smart Logic:** Context compression, smart truncation, and tool result caching.
- ✅ **Memory & History:** Persistent project memory and task execution history.
- ✅ **Interactive UI:** Real-time progress tracking and enhanced terminal UI.
- ✅ **Session Management:** Resume and rerun tasks across sessions.
- ✅ **Customization:** Custom plugin system and task templates.
- ✅ **QA & Performance:** Comprehensive test suite (1300+ tests) and benchmark runner.
- ✅ **Infrastructure:** npm package published and documentation site live.
- ✅ **Brand Refresh:** Renamed to `forge-agent` with scoped npm package.

---

## v1.5.0 — Phase 5: Scale & Integration (Planned)
**Target:** Q3 2026

### Security & Trust
- [ ] **Security Audit:** Full review of all file operations and path validations.
- [ ] **Penetration Testing:** Targeted testing for path traversal and AI injection risks.
- [ ] **Dependency Management:** Automated vulnerability scanning in CI/CD.

### Containerization
- [x] **Docker Support:** Official Docker image on GitHub Container Registry (`ghcr.io`).
- [x] **Ease of Use:** `docker run forge-agent "task"` for quick, isolated execution.
- [x] **Team Setup:** Docker Compose examples for collaborative development environments.

### Enhanced Toolbox
- [ ] `pdf_reader`: Extract and process text from PDF documents.
- [ ] `csv_reader`: Efficiently read and query large CSV datasets.
- [ ] `image_describe`: Leverage multimodal models to understand project screenshots or assets.
- [ ] `browser_goto`: Allow the agent to navigate to arbitrary URLs for research.
- [ ] `api_call`: Make structured HTTP requests to external APIs.
- [ ] `regex_replace`: Perform complex, multi-line file edits with regex.

### Performance & UI
- [ ] **Parallel Execution:** Run independent tool calls simultaneously to save time.
- [ ] **Streaming Progress:** Display AI reasoning and tokens in real-time as they arrive.
- [ ] **Token Counting:** More precise context management based on actual token usage.

---

## v2.0.0 — Phase 6: Platform (Future)
**Target:** 2027 and Beyond

### Multi-Agent Systems
- [ ] **Orchestration:** Run multiple agents in parallel on complex, multi-layered tasks.
- [ ] **Communication:** Protocols for agents to share context and hand off work.
- [ ] **Supervisor Mode:** A coordinator agent that delegates work to specialized sub-agents.

### Desktop Experience
- [ ] **GUI Application:** A full-featured desktop app (Electron or Tauri).
- [ ] **Visual Task Builder:** Create complex task flows using a drag-and-drop interface.
- [ ] **Live Browser View:** See exactly what the agent is doing in an embedded browser window.

### Integration Layer
- [ ] **API Server:** Run Forge Agent as a service with a REST and WebSocket API.
- [ ] **Webhooks:** Trigger agent tasks from external events (e.g., GitHub PRs).
- [ ] **Cloud Sync:** Sync memory, history, and templates across multiple machines.

### Community & Ecosystem
- [ ] **Plugin Registry:** A centralized directory for sharing and discovering custom tools.
- [ ] **Template Marketplace:** Community-contributed task templates for every tech stack.

---

## Contributing to the Roadmap

Have a great idea or a feature request?
- Open a **GitHub Discussion** to brainstorm new concepts.
- Submit a **Feature Request** using the issue template.
- Pull Requests for roadmap items are always welcome!
