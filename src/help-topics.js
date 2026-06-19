// src/help-topics.js — Detailed help content for Forge Agent topics
'use strict';

const A = {
  reset   : '\x1b[0m',
  bold    : '\x1b[1m',
  dim     : '\x1b[2m',
  red     : '\x1b[31m',
  green   : '\x1b[32m',
  yellow  : '\x1b[33m',
  blue    : '\x1b[34m',
  magenta : '\x1b[35m',
  cyan    : '\x1b[36m',
  white   : '\x1b[37m',
  gray    : '\x1b[90m',
};

const c = (code, text) => process.stdout.isTTY ? `${A[code]}${text}${A.reset}` : text;
const cb = (code, text) => process.stdout.isTTY ? `${A.bold}${A[code]}${text}${A.reset}` : text;

const TOPICS = {
  'getting-started': () => `
  ${cb('white', '🔨 GETTING STARTED WITH FORGE AGENT')}
  ${c('cyan', '────────────────────────────────────')}
  1. ${cb('white', 'First time setup:')}
     ${c('cyan', 'forge-agent --setup')}
     (runs the config wizard to set your preferences)

  2. ${cb('white', 'Run your first task:')}
     ${c('cyan', 'forge-agent "create a hello world HTML page"')}

  3. ${cb('white', 'For ongoing work use interactive mode:')}
     ${c('cyan', 'forge-agent --interactive')}
     (multiple tasks share context — type "new" to reset)

  4. ${cb('white', 'Install shell completions for tab completion:')}
     ${c('gray', 'source <(forge-agent --completion-bash)    # bash')}
     ${c('gray', 'source <(forge-agent --completion-zsh)     # zsh')}
     ${c('cyan', 'forge-agent --completion-fish > ~/.config/fish/completions/forge-agent.fish')}

  ${cb('white', 'TIPS FOR BEST RESULTS:')}
  • ${cb('white', 'Be specific:')} "add JWT auth to the Express API in src/routes/auth.js"
    is better than "add auth"
  • ${cb('white', 'Use profiles:')} ${c('cyan', '--profile=backend')} gives better results for APIs
  • ${cb('white', 'Use --plan')} for complex tasks to see what the agent intends to do
  • ${cb('white', 'Check history:')} ${c('cyan', 'forge-agent --history')} to see and resume past tasks
`,

  'profiles': () => `
  ${cb('white', '🎭 AGENT PROFILES')}
  ${c('cyan', '──────────────────')}
  Profiles pre-configure the agent for specific types of work.

  ${cb('white', 'AVAILABLE PROFILES:')}
  ${cb('white', 'default')}      General purpose — no specialisation (40 iterations)
  ${cb('white', 'backend')}      Node.js, Python, Go, REST APIs (50 iterations, planning on)
  ${cb('white', 'frontend')}     React, Vue, HTML/CSS, UI components (40 iterations)
  ${cb('white', 'data-science')} Python, pandas, ML, Jupyter (35 iterations)
  ${cb('white', 'devops')}       Docker, CI/CD, shell scripts, YAML (30 iterations, planning on)

  ${cb('white', 'USAGE:')}
  ${c('cyan', 'forge-agent --profile=backend "add database connection pooling"')}
  ${c('cyan', 'forge-agent --profile=frontend "create a responsive navbar component"')}
  ${c('cyan', 'forge-agent --profile=data-science "clean this CSV and plot distributions"')}
  ${c('cyan', 'forge-agent --profile=devops "write a Dockerfile for this Node app"')}

  ${cb('white', 'LIST ALL PROFILES:')}
  ${c('cyan', 'forge-agent --list-profiles')}

  ${cb('white', 'CUSTOM PROFILES:')}
  Create a JSON file with: ${c('gray', 'name, description, systemPromptAddition,')}
  ${c('gray', 'maxIterations, planningMode')} fields.
  ${c('cyan', 'forge-agent --custom-profile=./my-profile.json "your task"')}
`,

  'templates': () => `
  ${cb('white', '📋 TASK TEMPLATES')}
  ${c('cyan', '──────────────────')}
  Templates are saved task descriptions you can reuse across projects.

  ${cb('white', 'BUILT-IN TEMPLATES:')}
  ${cb('white', 'add-typescript')}     Add TypeScript to a JavaScript project
  ${cb('white', 'add-jest')}           Set up Jest testing from scratch
  ${cb('white', 'add-docker')}         Create Dockerfile and docker-compose.yml
  ${cb('white', 'add-github-actions')} Add GitHub Actions CI/CD workflow
  ${cb('white', 'add-eslint')}         Add ESLint and Prettier
  ${cb('white', 'add-env-setup')}      Set up .env files and validation
  ${cb('white', 'write-readme')}       Generate a comprehensive README.md
  ${cb('white', 'add-auth')}           Add JWT authentication to Express API
  ${cb('white', 'fix-tests')}          Run and fix all failing tests
  ${cb('white', 'code-review')}        Review codebase for issues

  ${cb('white', 'USAGE:')}
  ${c('cyan', 'forge-agent --template=add-typescript')}
  ${c('cyan', 'forge-agent --template=add-docker')}
  ${c('cyan', 'forge-agent --list-templates')}
  ${c('cyan', 'forge-agent --show-template=add-jest')}

  ${cb('white', 'SAVE YOUR OWN:')}
  ${c('cyan', 'forge-agent --save-template=my-setup "Set up my preferred project structure..."')}
  ${c('cyan', 'forge-agent --remove-template=my-setup')}
`,

  'plugins': () => `
  ${cb('white', '🔌 CUSTOM PLUGINS')}
  ${c('cyan', '──────────────────')}
  Add your own tools by dropping .js files into ${c('gray', '~/.deepseek-agent/tools/')}

  ${cb('white', 'PLUGIN FORMAT:')}
  ${cb('white', 'module.exports = {')}
    ${cb('white', "name: 'my_tool',")}          ${c('gray', '// lowercase, underscores only')}
    ${cb('white', "description: 'What it does',")}
    ${cb('white', 'parameters: {')}
      ${cb('white', "param: { type: 'string', required: true, description: '...' }")}
    ${cb('white', '},')}
    ${cb('white', 'async execute({ param }) {')}
      ${cb('white', "return 'result string';")}
    ${cb('white', '},')}
  ${cb('white', '};')}

  ${cb('white', 'GENERATE A STUB:')}
  ${c('cyan', 'forge-agent --new-plugin my_tool')}
  (creates ${c('gray', '~/.deepseek-agent/tools/my_tool.js')} with example code)

  ${cb('white', 'LIST LOADED PLUGINS:')}
  ${c('cyan', 'forge-agent --list-plugins')}

  ${cb('white', 'DISABLE A PLUGIN (without deleting):')}
  Rename the file to start with underscore: ${c('gray', '_my_tool.js')}

  ${cb('white', 'NOTES:')}
  • Plugin names cannot conflict with built-in tool names
  • Plugins load automatically on every forge-agent run
  • Plugin errors never crash the agent — they show a warning
`,

  'watch': () => `
  ${cb('white', '👁  WATCH MODE')}
  ${c('cyan', '──────────────')}
  Watch files for changes and automatically re-run a task.

  ${cb('white', 'BASIC USAGE:')}
  ${c('cyan', 'forge-agent --watch "run the failing tests and fix them"')}
  (watches src/ and re-runs when any file changes)

  ${cb('white', 'CUSTOM PATTERNS:')}
  ${c('cyan', 'forge-agent --watch --watch-pattern="src/**/*.js" "update JSDoc comments"')}
  ${c('cyan', 'forge-agent --watch --watch-pattern="tests/**" "fix failing tests"')}

  ${cb('white', 'OPTIONS:')}
  ${cb('white', '--watch-pattern=<glob>')}   Which files to watch (default: src/**/*)
  ${cb('white', '--watch-debounce=<ms>')}    Wait N ms after last change (default: 1000)
  ${cb('white', '--watch-max=<N>')}          Stop after N runs (default: unlimited)
  ${cb('white', '--watch-cooldown=<ms>')}    Min time between runs (default: 5000)

  ${cb('white', 'EXAMPLE — test-fix loop:')}
  ${c('cyan', 'forge-agent --watch --watch-pattern="src/**/*.js" \\')}
        ${c('cyan', '--watch-debounce=2000 \\')}
        ${c('cyan', '"run npm test and fix any failing tests"')}

  Press Ctrl+C to stop watching.
`,

  'performance': () => `
  ${cb('white', '⚡ PERFORMANCE TUNING')}
  ${c('cyan', '──────────────────────')}
  For slow machines or slow internet connections.

  ${cb('white', 'DEFAULT TIMINGS:')}
  Response timeout:  600 seconds (10 minutes)
  Max iterations:    100 steps
  Tool timeout:      300 seconds (5 minutes for npm install etc.)

  ${cb('white', 'INCREASE TIMEOUTS:')}
  ${c('cyan', 'forge-agent --timeout=1200 "complex refactoring task"')}
  ${c('cyan', 'forge-agent --tool-timeout=600 "task with slow npm installs"')}
  ${c('cyan', 'forge-agent --max-iterations=200 "very large project"')}

  ${cb('white', 'DISABLE TIMEOUT COMPLETELY:')}
  ${c('cyan', 'forge-agent --no-timeout "build entire application"')}
  (agent waits forever — use on very slow connections)

  ${cb('white', 'PERMANENT CONFIG (edit ~/.deepseek-agent/config.json):')}
  ${cb('white', '{')}
    ${cb('white', '"RESPONSE_TIMEOUT": 900000,')}
    ${cb('white', '"MAX_ITERATIONS": 150,')}
    ${cb('white', '"TOOL_TIMEOUT": 600000,')}
    ${cb('white', '"STABLE_DELAY": 2000')}
  ${cb('white', '}')}

  ${cb('white', 'RUN SETUP WIZARD:')}
  ${c('cyan', 'forge-agent --setup')}
  (guided configuration for all timing options)
`,

  'security': () => `
  ${cb('white', '🔒 SECURITY & SANDBOX')}
  ${c('cyan', '──────────────────────')}
  Forge Agent has multiple security layers to protect your system.

  ${cb('white', 'BLOCKED PATHS (always blocked regardless of settings):')}
  ${cb('white', '~/.ssh/')}          SSH private keys
  ${cb('white', '~/.aws/')}          AWS credentials
  ${cb('white', '~/.gnupg/')}        GPG keys
  ${cb('white', '/etc/passwd')}      System password file

  ${cb('white', 'SECRET MASKING:')}
  When reading .env files, values that look like secrets are masked:
  ${c('gray', 'JWT_SECRET=su****78')}   (shown as masked in AI context)
  ${c('gray', 'PORT=3000')}             (shown in full — not a secret)
  The AI never sees your actual API keys or passwords.

  ${cb('white', 'STRICT SANDBOX MODE:')}
  ${c('cyan', 'forge-agent --setup')}   (enable STRICT_SANDBOX in the wizard)
  OR add to config: ${cb('white', '{ "STRICT_SANDBOX": true }')}
  Blocks ALL file access outside the working directory.

  ${cb('white', 'PATH TRAVERSAL PROTECTION:')}
  Paths like ../../etc/passwd are blocked even in non-strict mode.
`,

  'models': () => `
  ${cb('white', '🌐 AI MODEL SELECTION')}
  ${c('cyan', '──────────────────────')}
  Forge Agent supports multiple web-based AI models.

  ${cb('white', 'SWITCH MODEL:')}
  ${c('cyan', 'forge-agent --model=deepseek "your task"')}    # default, recommended
  ${c('cyan', 'forge-agent --model=chatgpt "your task"')}     # requires chatgpt.com login
  ${c('cyan', 'forge-agent --model=gemini "your task"')}      # requires gemini.google.com login

  ${cb('white', 'SET DEFAULT MODEL (in config):')}
  ${cb('white', '{ "MODEL": "chatgpt" }')}
  OR run: ${c('cyan', 'forge-agent --setup')}

  ${cb('white', 'NOTES:')}
  • All models use the FREE web interface — no API key needed
  • You must be logged in to the model's website in your browser
  • DeepSeek is recommended — fastest and most reliable
  • Different models have different strengths:
    DeepSeek: best for coding, has R1 thinking mode
    ChatGPT:  best for writing and explanation
    Gemini:   best for Google ecosystem tasks

  ${cb('white', 'R1 THINKING MODE (DeepSeek only):')}
  ${c('cyan', 'forge-agent --think "complex algorithm task"')}
  Shows DeepSeek's chain-of-thought reasoning process.
`,

  'resume': () => `
  ${cb('white', '🔄 RESUMING & RE-RUNNING TASKS')}
  ${c('cyan', '────────────────────────────────')}
  Never lose progress on a task that stopped halfway.

  ${cb('white', 'SEE PAST TASKS:')}
  ${c('cyan', 'forge-agent --history')}

  ${cb('white', 'RESUME MOST RECENT:')}
  ${c('cyan', 'forge-agent --resume=last')}

  ${cb('white', 'INTERACTIVE RESUME PICKER:')}
  ${c('cyan', 'forge-agent --resume')}
  (shows numbered list — type a number to select)

  ${cb('white', 'RESUME SPECIFIC TASK:')}
  ${c('cyan', 'forge-agent --history')}              # find the task id
  ${c('cyan', 'forge-agent --resume=abc123')}        # resume by partial id

  ${cb('white', 'RE-RUN (fresh, no context):')}
  ${c('cyan', 'forge-agent --rerun')}                # re-run most recent task
  ${c('cyan', 'forge-agent --rerun=abc123')}         # re-run specific task

  ${cb('white', 'DIFFERENCE:')}
  ${cb('white', '--resume')}  = continues where it stopped (injects previous context)
  ${cb('white', '--rerun')}   = starts the same task completely fresh

  ${cb('white', 'VIEW HISTORY STATS:')}
  ${c('cyan', 'forge-agent --history-stats')}

  ${cb('white', 'SEARCH HISTORY:')}
  ${c('cyan', 'forge-agent --history-search=typescript')}
`,
};

module.exports = { TOPICS };
