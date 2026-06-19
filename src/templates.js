// src/templates.js — Task template system for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const BUILT_IN_TEMPLATES = {
  'add-typescript': {
    name: 'add-typescript',
    description: 'Add TypeScript to an existing JavaScript project',
    task: 'Add TypeScript to this project. Install typescript and @types/node as dev dependencies. Create a tsconfig.json with strict mode, target ES2020, outDir dist/. Add build and type-check scripts to package.json. Create a src/types/ directory for shared types. Do not convert all files — set up infrastructure so TypeScript compiles cleanly.',
    profile: 'backend',
    tags: ['typescript', 'setup']
  },
  'add-jest': {
    name: 'add-jest',
    description: 'Set up Jest testing framework from scratch',
    task: 'Set up Jest testing in this project. Install jest and @types/jest as dev dependencies. Create jest.config.js with testEnvironment: node, testMatch for tests/**/*.test.js, and coverage collection. Add test and test:coverage scripts to package.json. Create a tests/ directory with one example test file that tests a simple utility function. Make sure npm test runs and passes.',
    profile: 'backend',
    tags: ['testing', 'jest', 'setup']
  },
  'add-docker': {
    name: 'add-docker',
    description: 'Create Dockerfile and docker-compose.yml for this project',
    task: 'Create a production-ready Dockerfile for this project. Use a multi-stage build: first stage installs all dependencies and builds, second stage is slim production image with only production dependencies. Create a .dockerignore file. Create a docker-compose.yml with the app service, appropriate environment variables, port mapping, and a health check. Add a docker:build and docker:run script to package.json.',
    profile: 'devops',
    tags: ['docker', 'deployment', 'devops']
  },
  'add-github-actions': {
    name: 'add-github-actions',
    description: 'Add GitHub Actions CI/CD workflow',
    task: 'Create a GitHub Actions CI workflow for this project. Create .github/workflows/ci.yml that runs on push and pull_request to main. The workflow should: set up Node.js 18 and 20 in a matrix, install dependencies with npm ci, run npm test, and upload coverage as an artifact. Also create .github/workflows/release.yml that triggers on version tags (v*.*.*), runs tests, then publishes to npm using NPM_TOKEN secret.',
    profile: 'devops',
    tags: ['ci', 'github-actions', 'devops']
  },
  'add-eslint': {
    name: 'add-eslint',
    description: 'Add ESLint and Prettier code formatting',
    task: 'Add ESLint and Prettier to this project. Install eslint, prettier, eslint-config-prettier, and @eslint/js as dev dependencies. Create .eslintrc.json configured for the project language (detect from existing files). Create .prettierrc with: singleQuote: true, semi: true, tabWidth: 2, trailingComma: es5. Add lint, lint:fix, and format scripts to package.json. Run the linter on existing files and fix any auto-fixable issues.',
    profile: 'default',
    tags: ['linting', 'formatting', 'quality']
  },
  'add-env-setup': {
    name: 'add-env-setup',
    description: 'Create .env files and environment variable documentation',
    task: 'Set up environment variable management for this project. Create a .env.example file listing all required environment variables with placeholder values and comments explaining each one. Create a .env file (add to .gitignore if not already there) with development values. If there is no config loading in the project, add dotenv as a dependency and set it up in the entry file. Add a check-env script that verifies all required variables are set before the app starts.',
    profile: 'backend',
    tags: ['environment', 'config', 'setup']
  },
  'write-readme': {
    name: 'write-readme',
    description: 'Generate a comprehensive README.md for this project',
    task: 'Write a comprehensive README.md for this project. Read the existing code to understand what it does. Include: project title and one-line description, badges (npm version if applicable, license, test status), features list, installation instructions, quick start with working code examples, full API documentation or CLI reference, configuration options, contributing guidelines, and license. Make it professional enough to put on GitHub and npm.',
    profile: 'default',
    tags: ['documentation', 'readme']
  },
  'add-auth': {
    name: 'add-auth',
    description: 'Add JWT authentication to an Express/Node.js API',
    task: 'Add JWT authentication to this project. Install jsonwebtoken and bcryptjs. Create src/auth/ directory with: middleware/auth.js (JWT verification middleware), routes/auth.js (POST /auth/register and POST /auth/login endpoints), and utils/jwt.js (sign and verify helpers). Use environment variables JWT_SECRET and JWT_EXPIRES_IN. Add the auth routes to the main Express app. Write tests for the auth endpoints. Hash passwords with bcrypt before storing.',
    profile: 'backend',
    tags: ['auth', 'jwt', 'express', 'security']
  },
  'fix-tests': {
    name: 'fix-tests',
    description: 'Run failing tests and fix all errors',
    task: 'Run the test suite and fix all failing tests. First run the tests to see what is failing. Then read the failing test files and the source files they test. Fix the source code (not the tests) to make them pass. If a test is testing functionality that does not exist yet, implement that functionality. Run the tests again after each fix to confirm progress. Continue until all tests pass.',
    profile: 'backend',
    tags: ['testing', 'debugging', 'fixes']
  },
  'code-review': {
    name: 'code-review',
    description: 'Review this codebase and suggest improvements',
    task: 'Review this codebase thoroughly. Read the main source files and identify: 1) Security issues (hardcoded secrets, SQL injection risks, missing input validation), 2) Performance issues (N+1 queries, missing indexes, inefficient loops), 3) Code quality issues (duplicated code, long functions, missing error handling), 4) Missing tests for critical paths. For each issue found: explain the problem, show the problematic code, and provide the fixed version. Prioritise by severity.',
    profile: 'default',
    tags: ['review', 'quality', 'security']
  }
};

class TemplateStore {
  constructor(templateFilePath = config.TEMPLATES_FILE) {
    this.templateFilePath = templateFilePath;
  }

  load() {
    try {
      if (fs.existsSync(this.templateFilePath)) {
        const data = fs.readFileSync(this.templateFilePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed.templates === 'object') {
          return parsed;
        }
      }
    } catch (err) {
      // ignore
    }
    return { version: 1, templates: {} };
  }

  save(data) {
    try {
      fs.mkdirSync(path.dirname(this.templateFilePath), { recursive: true });
      fs.writeFileSync(this.templateFilePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    } catch (err) {
      // ignore
    }
  }

  getBuiltIn(name) {
    return BUILT_IN_TEMPLATES[name] || null;
  }

  getCustom(name) {
    const data = this.load();
    return data.templates[name] || null;
  }

  get(name) {
    return this.getCustom(name) || this.getBuiltIn(name);
  }

  listAll() {
    const data = this.load();
    const all = [
      ...Object.values(BUILT_IN_TEMPLATES).map(t => ({ ...t, source: 'built-in' })),
      ...Object.values(data.templates).map(t => ({ ...t, source: 'custom' }))
    ];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  listByTag(tag) {
    const search = tag.toLowerCase();
    return this.listAll().filter(t => t.tags && t.tags.some(tg => tg.toLowerCase() === search));
  }

  search(query) {
    const search = query.toLowerCase();
    return this.listAll().filter(t => 
      t.name.toLowerCase().includes(search) || 
      (t.description && t.description.toLowerCase().includes(search))
    );
  }

  add(name, task, opts = {}) {
    if (!/^[a-z0-9-]+$/.test(name)) return { success: false, error: 'Name must be lowercase alphanumeric with hyphens' };
    if (this.getBuiltIn(name)) return { success: false, error: 'Cannot override built-in template' };
    
    const data = this.load();
    data.templates[name] = {
      name,
      description: opts.description || '',
      task,
      profile: opts.profile || 'default',
      tags: opts.tags || [],
      createdAt: new Date().toISOString(),
      useCount: 0
    };
    this.save(data);
    return { success: true };
  }

  remove(name) {
    if (this.getBuiltIn(name)) return { removed: false, error: 'Cannot remove built-in template' };
    
    const data = this.load();
    if (!data.templates[name]) return { removed: false, error: 'Template not found' };
    
    delete data.templates[name];
    this.save(data);
    return { removed: true };
  }

  incrementUseCount(name) {
    const data = this.load();
    if (data.templates[name]) {
      data.templates[name].useCount = (data.templates[name].useCount || 0) + 1;
      this.save(data);
    }
  }

  resolveTask(name, variables = {}) {
    const template = this.get(name);
    if (!template) return null;
    
    let task = template.task;
    for (const [key, value] of Object.entries(variables)) {
      task = task.split(`{{${key}}}`).join(value);
    }
    return task;
  }

  formatTemplate(template, verbose = false) {
    if (verbose) {
      return [
        `Name: ${template.name}`,
        `Description: ${template.description}`,
        `Profile: ${template.profile}`,
        `Tags: ${template.tags.join(', ')}`,
        `Task preview: ${template.task.slice(0, 100)}...`
      ].join('\n');
    }
    return `${template.name.padEnd(20)} ${template.description.padEnd(50)} [${template.profile}] #${template.tags.join(' #')}`;
  }

  formatList(templates) {
    if (templates.length === 0) return 'No templates found.';
    return templates.map(t => this.formatTemplate(t)).join('\n');
  }
}

module.exports = { TemplateStore, BUILT_IN_TEMPLATES: Object.values(BUILT_IN_TEMPLATES) };
