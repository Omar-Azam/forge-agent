# Contributing to Forge Agent

Thank you for considering contributing to Forge Agent! We welcome contributions from everyone. This document provides guidelines for contributing to the project.

## Ways to Contribute
- 🐛 **Report bugs:** Use the Bug Report template on GitHub for `@omar-azam/forge-agent`.
- 💡 **Suggest features:** Use the Feature Request template.
- 📝 **Improve documentation:** Fix typos, clarify sections, or add new examples.
- 🔧 **Fix bugs:** Check the issues list for "bug" labels.
- ⚡ **Add new tools:** Implement new capabilities in `src/tools.js`.
- 🔌 **Share plugins:** Build and share custom plugins via GitHub Discussions.

## Development Setup

### Prerequisites
- Node.js 18 or higher
- npm 8 or higher
- Git

### Clone and Install
```bash
git clone https://github.com/Omar-Azam/forge-agent
cd forge-agent
npm install
```

### Verify Setup
```bash
npm test                      # All tests must pass
node src/index.js --version   # Should print: Forge Agent v2.0.0
```

### Run in Development
```bash
# Using the local entry point
node src/index.js --interactive
node src/index.js "your test task"

# Using the global command (if installed via npm link)
forge-agent --interactive
```

## Project Structure

- `src/index.js`: CLI entry point and argument parsing.
- `src/agent.js`: Core agent loop and state management.
- `src/browser.js`: Playwright browser automation wrapper.
- `src/adapters/`: Model-specific browser interface logic.
- `src/tools.js`: Implementation of all agent tools.
- `src/planner.js`: Task planning and step generation.
- `src/memory.js`: Long-term project memory system.
- `src/history.js`: Task history and execution logs.
- `src/config.js`: Central configuration management.
- `src/logger.js`: Terminal output and UI rendering.
- `src/parser.js`: AI response parsing and tool call extraction.
- `src/benchmarks/`: Performance measurement suite.
- `src/calibrate.js`: Utility to auto-detect browser selectors.
- `src/postinstall.js`: Post-install setup script.
- `tests/`: Comprehensive test suite using Jest.
- `docs/`: Documentation site source.

## Adding a New Tool

1. Open `src/tools.js`.
2. Add your tool definition to the `TOOLS` object following the existing pattern.
3. Add the tool to `shouldCache()` in `src/tool-cache.js` if it is a read-only operation.
4. Write at least 3 tests in `tests/tools.test.js` (or a new test file).
5. Document the tool in `docs/tools.html`.
6. Run `npm test` to ensure everything passes.

Example minimal tool:
```javascript
my_tool: {
  description: 'What this tool does.',
  parameters: {
    input: { type: 'string', required: true, description: 'The input value' },
  },
  async execute({ input }) {
    return `Result: ${input}`;
  },
},
```

## Adding a New Template

1. Open `src/templates.js`.
2. Add your template to the `BUILT_IN_TEMPLATES` object.
3. Write at least 2 tests in `tests/templates.test.js`.
4. Add the template to `docs/templates.html`.

## Writing Tests
- **Location:** All tests go in the `tests/` directory.
- **Framework:** We use Jest.
- **Requirements:** Every new feature needs at least 10 tests.
- **Isolation:** Tests must not depend on an actual browser or network. Use mocks where necessary.
- **Cleanup:** Always clean up temporary files in `afterAll()`.
- **Environment:** Use `os.tmpdir()` for file-based tests. Never touch `~/.deepseek-agent/`.

## Code Style
- Use **semicolons** and maintain consistent indentation (match existing files).
- Use `const` and `let`, never `var`.
- Prefer `async/await` over callbacks or `.then()`.
- Use descriptive variable and function names.
- Document complex logic with comments.
- Keep functions under **80 lines**; split them if they grow larger.
- Error messages should follow the **what/why/how** pattern.

## Commit Message Format
We use a structured commit message format:
`type: brief description (under 72 chars)`

**Types:**
- `feat`: A new feature or tool
- `fix`: A bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `chore`: Maintenance tasks (dependencies, build scripts, etc.)

Example: `feat: add xml_reader tool for parsing XML files`

## Pull Request Process

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-new-tool`.
3. Implement your changes and add tests.
4. Run `npm test` and ensure all tests pass.
5. Update relevant documentation in `docs/`.
6. Open a PR with a clear description of what changed and why.
7. Fill out the PR template completely.

### What Makes a Good PR?
- ✅ Focused on a single change.
- ✅ All tests pass.
- ✅ Includes new tests for new logic.
- ✅ Documentation is updated.
- ✅ No unrelated refactoring or cleanup.
- ✅ Follows the commit message format.

## Getting Help
- If you have questions, please open a **GitHub Discussion**.
- For bugs, open a **GitHub Issue**.
- Check existing issues and discussions before opening new ones.
