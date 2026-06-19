// src/examples.js — Curated collection of example project blueprints for Forge Agent
'use strict';

const EXAMPLES = [
  {
    id: 'cli-game',
    title: 'Terminal Text Adventure Game',
    description: 'A classic text-based adventure game with rooms, inventory, and combat that runs entirely in your terminal.',
    category: 'backend',
    difficulty: 'beginner',
    estimatedTime: '5-10 min',
    tags: ['node', 'game', 'cli', 'chalk'],
    profile: 'backend',
    task: `Build a text adventure game that runs in the terminal. The game should have:
- At least 8 rooms connected by directions (north, south, east, west)
- An inventory system to pick up and drop items
- A puzzle that requires combining or using items to progress
- Save and load game state functionality using a JSON file
- Colorful terminal output using the chalk library
- A simple health system and turn-based combat

Project structure:
src/
  game.js      — Main game loop and entry point
  world.js     — Room definitions and connections
  player.js    — Player state management (inventory, health)
  combat.js    — Simple battle system logic
  save.js      — JSON save/load functionality
data/
  world.json   — Initial room and item data

The game must be playable by running: node src/game.js`,
    expectedFiles: ['src/game.js', 'src/world.js', 'src/player.js', 'data/world.json', 'package.json'],
    techStack: ['Node.js', 'Chalk', 'JavaScript'],
  },
  {
    id: 'python-cli-tool',
    title: 'Python CLI Tool with Click',
    description: 'A robust command-line utility with subcommands, progress bars, and multiple output formats.',
    category: 'backend',
    difficulty: 'beginner',
    estimatedTime: '5-10 min',
    tags: ['python', 'cli', 'click', 'rich'],
    profile: 'backend',
    task: `Build a Python CLI tool using the Click framework. The tool should:
- Have at least 3 subcommands (e.g., convert, analyze, clean)
- Accept various arguments and options (e.g., --input, --format, --verbose)
- Show a professional progress bar for long operations using the 'rich' library
- Support multiple output formats like Table, JSON, and CSV
- Include proper error handling with user-friendly error messages
- Provide a setup.py or pyproject.toml for easy installation via pip
- Include unit tests using pytest

Create a realistic tool like a file organizer, log analyzer, or data converter.`,
    expectedFiles: ['main.py', 'setup.py', 'requirements.txt', 'tests/test_cli.py', 'README.md'],
    techStack: ['Python', 'Click', 'Rich', 'Pytest'],
  },
  {
    id: 'react-todo-app',
    title: 'React Todo App with Local Storage',
    description: 'A polished, responsive task manager built with pure React and CSS Modules.',
    category: 'frontend',
    difficulty: 'beginner',
    estimatedTime: '5-10 min',
    tags: ['react', 'frontend', 'localstorage', 'css-modules'],
    profile: 'frontend',
    task: `Build a React todo application with the following features:
- Core CRUD: Add, edit, delete, and mark todos as complete
- Filtering: Filter tasks by status (All, Active, Completed)
- Persistence: Use localStorage to save tasks between sessions
- Theming: Toggle between Dark and Light modes
- Responsive Design: Works perfectly on mobile and desktop
- Modern Tech: Use Functional Components and Hooks (useState, useEffect, useMemo)

No external UI libraries allowed. Use pure React with CSS Modules.
Structure:
src/
  components/
    TodoList.jsx
    TodoItem.jsx
    TodoForm.jsx
    Filter.jsx
    ThemeToggle.jsx
  hooks/
    useTodos.js
    useTheme.js
  App.jsx
  styles/ (CSS modules)

Include component tests using React Testing Library.`,
    expectedFiles: ['src/App.jsx', 'src/components/TodoList.jsx', 'src/hooks/useTodos.js', 'src/App.test.js', 'package.json'],
    techStack: ['React', 'CSS Modules', 'Vitest'],
  },
  {
    id: 'express-rest-api',
    title: 'Express REST API with JWT Auth',
    description: 'A production-ready REST API with JWT authentication, PostgreSQL, and integration tests.',
    category: 'backend',
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
    tags: ['node', 'express', 'jwt', 'postgresql', 'rest-api'],
    profile: 'backend',
    task: `Build a production-ready REST API with the following specifications:

Framework: Express.js with Node.js
Database: PostgreSQL with connection pooling (use pg package)
Authentication: JWT tokens (jsonwebtoken) with bcrypt password hashing

Required endpoints:
- POST /auth/register — register new user (name, email, password)
- POST /auth/login    — login, returns JWT token
- GET  /users/me      — get current user profile (requires auth middleware)
- PUT  /users/me      — update current user profile
- DELETE /users/me    — delete account

File structure to create:
src/
  app.js             — Express app setup
  server.js          — Server entry point
  middleware/
    auth.js          — JWT verification middleware
    validate.js      — Input validation middleware
    errorHandler.js  — Global error handler
  routes/
    auth.js          — Auth routes
    users.js         — User routes
  controllers/
    authController.js
    userController.js
  models/
    User.js          — User model with queries
  config/
    database.js      — PostgreSQL pool setup
  utils/
    jwt.js           — Token helpers
    hash.js          — Password helpers
tests/
  auth.test.js
  users.test.js
.env.example         — Required environment variables

Use environment variables: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT.
Add input validation for all endpoints.
Write integration tests using Jest and supertest.
Include a README.md with setup instructions.`,
    expectedFiles: ['src/app.js', 'src/server.js', 'src/middleware/auth.js', 'src/routes/auth.js', 'src/controllers/authController.js', '.env.example', 'package.json', 'README.md'],
    techStack: ['Node.js', 'Express', 'PostgreSQL', 'JWT', 'Jest'],
  },
  {
    id: 'nextjs-blog',
    title: 'Next.js Blog with Markdown',
    description: 'High-performance static blog using Next.js App Router and local Markdown files.',
    category: 'frontend',
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
    tags: ['nextjs', 'react', 'markdown', 'seo'],
    profile: 'frontend',
    task: `Build a Next.js 14 blog with the following features:
- App Router: Use the modern Next.js file-system based router
- Markdown Posts: Store posts as .md files in a /posts directory
- Dynamic Routing: Automatically generate pages for each post
- Homepage: List all posts sorted by date with summary snippets
- Tag System: Filter posts by tags/categories
- Code Highlighting: Use Prism.js or highlight.js for syntax in code blocks
- RSS Feed: Automatically generate an RSS feed at /feed.xml
- SEO: Proper meta tags, OpenGraph images, and sitemap.xml
- Dark Mode: Support system preference with next-themes
- Static Generation: Full SSG for maximum performance

No database required — use pure filesystem markdown parsing. Include 3 sample posts.`,
    expectedFiles: ['app/page.tsx', 'app/posts/[slug]/page.tsx', 'lib/posts.ts', 'posts/hello-world.md', 'package.json'],
    techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Gray-matter'],
  },
  {
    id: 'docker-compose-stack',
    title: 'Full Docker Compose Development Stack',
    description: 'Multi-container orchestration for a full-stack app including API, DB, Cache, and Proxy.',
    category: 'devops',
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
    tags: ['docker', 'devops', 'postgresql', 'redis', 'nginx'],
    profile: 'devops',
    task: `Create a complete Docker Compose development stack with the following services:
- Node.js API: Custom app service with hot-reloading
- PostgreSQL: Database with persistent volume for data
- Redis: For caching and session management
- Nginx: Reverse proxy with custom configuration to route /api to the Node service
- pgAdmin: Web-based database management interface

Files to include:
- docker-compose.yml: Main development configuration
- docker-compose.prod.yml: Production overrides (no pgAdmin, optimized settings)
- Dockerfile: Optimized multi-stage build for the Node.js API
- nginx/default.conf: Nginx proxy configuration
- .env.example: Required environment variables
- Makefile: Helper commands (make up, make down, make logs, make db-shell)
- Health Checks: Ensure services are healthy before dependents start
- README.md: Full setup and usage instructions`,
    expectedFiles: ['docker-compose.yml', 'Dockerfile', 'nginx/default.conf', 'Makefile', '.env.example', 'README.md'],
    techStack: ['Docker', 'Nginx', 'PostgreSQL', 'Redis', 'Node.js'],
  },
  {
    id: 'data-analysis-notebook',
    title: 'Python Data Analysis Pipeline',
    description: 'End-to-end data processing pipeline with cleaning, analysis, visualization, and reporting.',
    category: 'data-science',
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
    tags: ['python', 'pandas', 'matplotlib', 'jupyter', 'data-science'],
    profile: 'data-science',
    task: `Build a Python data analysis pipeline for a CSV dataset. Create the following structure:
- data/raw/: Directory for input CSV files
- data/processed/: Directory for cleaned and transformed output
- src/clean.py: Data cleaning, type conversion, and validation logic
- src/analyse.py: Statistical analysis and insight extraction
- src/visualise.py: Chart generation using matplotlib or seaborn
- src/report.py: Generate a final HTML or PDF report summarizing findings
- notebooks/exploration.ipynb: Jupyter notebook containing the full exploratory data analysis

Use pandas for data manipulation and numpy for calculations.
The pipeline should be fully automated and runnable via:
python src/clean.py && python src/analyse.py && python src/report.py

Include a requirements.txt with all dependencies.`,
    expectedFiles: ['src/clean.py', 'src/analyse.py', 'src/visualise.py', 'notebooks/exploration.ipynb', 'requirements.txt'],
    techStack: ['Python', 'Pandas', 'Matplotlib', 'Seaborn', 'Jupyter'],
  },
  {
    id: 'fastapi-backend',
    title: 'FastAPI Backend with SQLAlchemy',
    description: 'High-performance Python API with async database access, migrations, and Pydantic validation.',
    category: 'backend',
    difficulty: 'intermediate',
    estimatedTime: '10-15 min',
    tags: ['python', 'fastapi', 'sqlalchemy', 'pydantic', 'alembic'],
    profile: 'backend',
    task: `Build a high-performance FastAPI backend with the following features:
- SQLAlchemy ORM: Async database access with SQLite (dev) and PostgreSQL (prod support)
- Alembic: Database migration setup and initial migration
- Pydantic: Strict data validation and serialization schemas
- Auth: OAuth2 password flow with JWT tokens
- Background Tasks: Example endpoint that triggers an asynchronous task
- File Uploads: Secure endpoint for handling file uploads
- Documentation: Automatic OpenAPI (Swagger) documentation setup

Structure:
app/
  api/routes/       — API endpoints
  core/             — Config, security, and global settings
  db/               — Models and session management
  schemas/          — Pydantic models
alembic/            — Migration scripts

Include a requirements.txt, Dockerfile, and pytest suite with TestClient.`,
    expectedFiles: ['app/main.py', 'app/db/session.py', 'alembic.ini', 'requirements.txt', 'Dockerfile', 'tests/test_api.py'],
    techStack: ['FastAPI', 'SQLAlchemy', 'Alembic', 'Pydantic', 'Pytest'],
  },
  {
    id: 'vue-dashboard',
    title: 'Vue 3 Admin Dashboard',
    description: 'Advanced administrative interface with nested routing, state management, and data visualization.',
    category: 'frontend',
    difficulty: 'advanced',
    estimatedTime: '15-20 min',
    tags: ['vue', 'pinia', 'chartjs', 'dashboard', 'frontend'],
    profile: 'frontend',
    task: `Build a professional Vue 3 admin dashboard using the Composition API.
Include the following:
- Layout: Sidebar navigation with nested routes and breadcrumbs
- Data Tables: Robust tables with sorting, filtering, and pagination (custom implementation)
- Forms: Complex form with validation using VeeValidate or similar
- Visuals: Interactive charts and graphs using Chart.js or D3.js
- State: Pinia for global state management (user sessions, settings)
- Themes: Persistent Dark/Light mode support
- Mocking: Setup a mock API or use hardcoded sample data
- Components: Dashboard.vue, UsersTable.vue, UserForm.vue, Sidebar.vue, Header.vue

Ensure the dashboard is fully responsive and uses modern Vue 3 patterns.`,
    expectedFiles: ['src/main.js', 'src/App.vue', 'src/store/index.js', 'src/views/Dashboard.vue', 'package.json'],
    techStack: ['Vue 3', 'Pinia', 'Vue Router', 'Chart.js', 'Vite'],
  },
  {
    id: 'github-actions-ci',
    title: 'Complete GitHub Actions CI/CD Pipeline',
    description: 'Enterprise-grade automation for testing, security auditing, and releasing software.',
    category: 'devops',
    difficulty: 'advanced',
    estimatedTime: '15-20 min',
    tags: ['github-actions', 'ci-cd', 'devops', 'automation'],
    profile: 'devops',
    task: `Create a comprehensive GitHub Actions CI/CD setup for a Node.js project.
Include the following workflows and files:
- .github/workflows/ci.yml: Run tests on every PR (matrix: Node.js 18, 20, 22)
- .github/workflows/release.yml: Automated versioning and publishing to npm on tags
- .github/workflows/security.yml: Weekly npm audit and CodeQL security analysis
- .github/workflows/stale.yml: Automatically manage stale issues and PRs
- .github/ISSUE_TEMPLATE/: Structured bug reports and feature requests (YAML format)
- .github/PULL_REQUEST_TEMPLATE.md: Detailed PR checklist for contributors
- .github/CODEOWNERS: Define ownership rules for different parts of the repo

The setup should include workflow status badges in the README.md and proper secret management documentation.`,
    expectedFiles: ['.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/CODEOWNERS', 'README.md'],
    techStack: ['GitHub Actions', 'YAML', 'Node.js', 'Security'],
  },
];

// Sort by difficulty (beginner -> intermediate -> advanced) then category
const difficultyOrder = { beginner: 1, intermediate: 2, advanced: 3 };
const EXAMPLES_SORTED = [...EXAMPLES].sort((a, b) => {
  const diff = difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
  if (diff !== 0) return diff;
  return a.category.localeCompare(b.category);
});

/**
 * Returns an example by its ID.
 */
function getExample(id) {
  if (!id) return null;
  return EXAMPLES.find(e => e.id === id) || null;
}

/**
 * Returns a filtered array of examples.
 */
function listExamples(opts = {}) {
  let list = EXAMPLES_SORTED;
  
  if (opts.category) {
    const cat = opts.category.toLowerCase();
    list = list.filter(e => e.category === cat);
  }
  
  if (opts.difficulty) {
    const diff = opts.difficulty.toLowerCase();
    list = list.filter(e => e.difficulty === diff);
  }
  
  if (opts.tags && Array.isArray(opts.tags)) {
    list = list.filter(e => opts.tags.every(t => e.tags.includes(t)));
  }
  
  if (opts.search) {
    const q = opts.search.toLowerCase();
    list = list.filter(e => 
      e.title.toLowerCase().includes(q) || 
      e.description.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  return list;
}

/**
 * Returns all unique category names.
 */
function getCategories() {
  return [...new Set(EXAMPLES.map(e => e.category))].sort();
}

/**
 * Returns all difficulty levels.
 */
function getDifficulties() {
  return ['beginner', 'intermediate', 'advanced'];
}

/**
 * Formats an example into a terminal card string.
 */
function formatExampleCard(example) {
  if (!example) return '';
  
  const width = 60;
  const line = '─'.repeat(width);
  const title = example.title.padEnd(width);
  const meta = `${example.category} · ${example.difficulty} · ${example.estimatedTime}`.padEnd(width);
  const tech = example.techStack.join(' · ').padEnd(width);
  
  // Wrap description
  const descLines = [];
  const words = example.description.split(' ');
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + word).length > width) {
      descLines.push(currentLine.trim().padEnd(width));
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  descLines.push(currentLine.trim().padEnd(width));

  return [
    `┌${line}┐`,
    `│ ${title} │`,
    `│ ${meta} │`,
    `│ ${tech} │`,
    `│ ${' '.repeat(width)} │`,
    ...descLines.map(l => `│ ${l} │`),
    `└${line}┘`
  ].join('\n');
}

/**
 * Formats a list of examples for terminal display.
 */
function formatExampleList(examples) {
  if (!examples || examples.length === 0) return 'No examples found.';
  
  return examples.map((e, i) => {
    const num = `[${i + 1}]`.padEnd(5);
    const star = '⭐ ';
    const meta = `(${e.category} · ${e.difficulty})`;
    return `${num} ${star} ${e.title.padEnd(40)} ${meta}`;
  }).join('\n');
}

module.exports = {
  EXAMPLES: EXAMPLES_SORTED,
  getExample,
  listExamples,
  getCategories,
  getDifficulties,
  formatExampleCard,
  formatExampleList
};
