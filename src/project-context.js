'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ─────────────────────────────────────────────
//  ProjectContext shape
// ─────────────────────────────────────────────
/*
{
  projectName    : string    — folder name (e.g. "my-api")
  projectPath    : string    — absolute path
  techStack      : string[]  — detected tech stack (Node, Python, etc.)
  completedTasks : TaskEntry[] — history of completed tasks
  keyFiles       : string[]  — important files in this project
  projectSummary : string    — human-readable project description
  createdAt      : ISO string
  updatedAt      : ISO string
  totalSessions  : number
}
*/

const PROJECTS_DIR = path.join(os.homedir(), '.deepseek-agent', 'projects');

// ─────────────────────────────────────────────
//  Utility
// ─────────────────────────────────────────────

function projectId(projectPath) {
  return crypto
    .createHash('md5')
    .update(projectPath)
    .digest('hex')
    .slice(0, 12);
}

function projectFilePath(projectPath) {
  return path.join(PROJECTS_DIR, `${projectId(projectPath)}.json`);
}

function ensureProjectsDir() {
  try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}
}

// ─────────────────────────────────────────────
//  Tech stack detection
// ─────────────────────────────────────────────

async function detectTechStack(projectPath) {
  const stack = [];
  const files = [];

  try {
    const entries = fs.readdirSync(projectPath);
    files.push(...entries);
  } catch { return stack; }

  // Node.js
  if (files.includes('package.json')) {
    stack.push('Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react)      stack.push('React');
      if (deps.vue)        stack.push('Vue');
      if (deps.angular || deps['@angular/core']) stack.push('Angular');
      if (deps.express)    stack.push('Express');
      if (deps.fastify)    stack.push('Fastify');
      if (deps.next)       stack.push('Next.js');
      if (deps.typescript || deps['@types/node']) stack.push('TypeScript');
      if (deps.jest || deps.vitest) stack.push('Testing:Jest/Vitest');
      if (deps.prisma || deps['@prisma/client']) stack.push('Prisma');
      if (deps.mongoose)   stack.push('MongoDB/Mongoose');
      if (deps.sequelize)  stack.push('Sequelize');
    } catch {}
  }

  // Python
  if (files.includes('requirements.txt') ||
      files.includes('setup.py') ||
      files.includes('pyproject.toml') ||
      files.includes('Pipfile')) {
    stack.push('Python');
    try {
      const req = files.includes('requirements.txt')
        ? fs.readFileSync(path.join(projectPath, 'requirements.txt'), 'utf8')
        : '';
      if (req.includes('django'))    stack.push('Django');
      if (req.includes('flask'))     stack.push('Flask');
      if (req.includes('fastapi'))   stack.push('FastAPI');
      if (req.includes('pandas'))    stack.push('pandas');
      if (req.includes('numpy'))     stack.push('numpy');
      if (req.includes('torch'))     stack.push('PyTorch');
    } catch {}
  }

  // Go
  if (files.includes('go.mod')) stack.push('Go');

  // Rust
  if (files.includes('Cargo.toml')) stack.push('Rust');

  // Docker
  if (files.includes('Dockerfile') || files.includes('docker-compose.yml')) {
    stack.push('Docker');
  }

  // Database hints
  if (files.some(f => f.includes('.sql'))) stack.push('SQL');

  return [...new Set(stack)]; // deduplicate
}

function detectKeyFiles(projectPath) {
  const important = [
    'package.json', 'README.md', 'Dockerfile', 'docker-compose.yml',
    '.env.example', 'tsconfig.json', 'webpack.config.js', 'vite.config.js',
    'jest.config.js', 'setup.py', 'pyproject.toml', 'go.mod', 'Cargo.toml',
    'Makefile', '.github/workflows',
  ];
  try {
    const entries = fs.readdirSync(projectPath);
    return important.filter(f => entries.includes(f) || entries.includes(f.split('/')[0]));
  } catch { return []; }
}

// ─────────────────────────────────────────────
//  ProjectContextManager
// ─────────────────────────────────────────────

class ProjectContextManager {

  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath || process.cwd());
    this.projectName = path.basename(this.projectPath);
    this._data       = null;
    ensureProjectsDir();
  }

  // ── Load existing context ─────────────────────────────────────────────────

  load() {
    try {
      const file = projectFilePath(this.projectPath);
      if (!fs.existsSync(file)) return null;
      const raw   = fs.readFileSync(file, 'utf8');
      this._data  = JSON.parse(raw);
      return this._data;
    } catch {
      return null;
    }
  }

  // ── Save context ──────────────────────────────────────────────────────────

  save() {
    try {
      const file = projectFilePath(this.projectPath);
      fs.writeFileSync(file, JSON.stringify(this._data, null, 2) + '\n', 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  // ── Initialize for first time ─────────────────────────────────────────────

  async initialize() {
    const techStack = await detectTechStack(this.projectPath);
    const keyFiles  = detectKeyFiles(this.projectPath);

    this._data = {
      projectName   : this.projectName,
      projectPath   : this.projectPath,
      techStack,
      keyFiles,
      completedTasks: [],
      projectSummary: '',
      createdAt     : new Date().toISOString(),
      updatedAt     : new Date().toISOString(),
      totalSessions : 1,
    };

    this.save();
    return this._data;
  }

  // ── Get or initialize ─────────────────────────────────────────────────────

  async getOrCreate() {
    const existing = this.load();
    if (existing) {
      // Update tech stack (it may have changed)
      existing.techStack    = await detectTechStack(this.projectPath);
      existing.keyFiles     = detectKeyFiles(this.projectPath);
      existing.totalSessions = (existing.totalSessions || 0) + 1;
      existing.updatedAt    = new Date().toISOString();
      this._data = existing;
      this.save();
      return existing;
    }
    return await this.initialize();
  }

  // ── Record completed task ─────────────────────────────────────────────────

  recordTask(task, summary, filesCreated = []) {
    if (!this._data) return;

    const entry = {
      task       : task.slice(0, 200),
      summary    : summary.slice(0, 500),
      files      : filesCreated.slice(0, 20),
      completedAt: new Date().toISOString(),
    };

    this._data.completedTasks = [
      entry,
      ...(this._data.completedTasks || []),
    ].slice(0, 50); // keep last 50 tasks

    this._data.updatedAt = new Date().toISOString();
    this.save();
  }

  // ── Update project summary ────────────────────────────────────────────────

  updateSummary(summary) {
    if (!this._data) return;
    this._data.projectSummary = summary.slice(0, 1000);
    this._data.updatedAt      = new Date().toISOString();
    this.save();
  }

  // ── Build context string for injection into AI ────────────────────────────

  buildContextString() {
    if (!this._data) return '';

    const d = this._data;
    const lines = [
      '═══════════════════════════════════════════',
      'PROJECT CONTEXT (from previous sessions)',
      '═══════════════════════════════════════════',
      '',
      `Project: ${d.projectName}`,
      `Path: ${d.projectPath}`,
    ];

    if (d.techStack && d.techStack.length > 0) {
      lines.push(`Tech Stack: ${d.techStack.join(', ')}`);
    }

    if (d.keyFiles && d.keyFiles.length > 0) {
      lines.push(`Key Files: ${d.keyFiles.join(', ')}`);
    }

    if (d.projectSummary) {
      lines.push('');
      lines.push('Project Summary:');
      lines.push(d.projectSummary);
    }

    if (d.completedTasks && d.completedTasks.length > 0) {
      lines.push('');
      lines.push('Previously Completed Tasks:');
      const recentTasks = d.completedTasks.slice(0, 10);
      recentTasks.forEach((t, i) => {
        lines.push(`  ${i + 1}. ${t.task}`);
        if (t.summary) lines.push(`     → ${t.summary}`);
        if (t.files && t.files.length > 0) {
          lines.push(`     Files: ${t.files.join(', ')}`);
        }
      });
    }

    lines.push('═══════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
  }

  // ── Get stats for /memory command ─────────────────────────────────────────

  getStats() {
    if (!this._data) return null;
    return {
      projectName   : this._data.projectName,
      techStack     : this._data.techStack || [],
      taskCount     : (this._data.completedTasks || []).length,
      totalSessions : this._data.totalSessions || 0,
      createdAt     : this._data.createdAt,
      updatedAt     : this._data.updatedAt,
    };
  }

  // ── Format for display (/memory command) ─────────────────────────────────

  formatDisplay() {
    const d = this._data;
    if (!d) return '💾 No project context saved yet for this directory.';

    const lines = [
      `💾 Project Context — ${d.projectName}`,
      '─'.repeat(50),
      `Path:     ${d.projectPath}`,
      `Stack:    ${(d.techStack || []).join(', ') || 'unknown'}`,
      `Sessions: ${d.totalSessions || 0}`,
      `Tasks:    ${(d.completedTasks || []).length} completed`,
      '',
    ];

    if (d.projectSummary) {
      lines.push('Summary:');
      lines.push('  ' + d.projectSummary);
      lines.push('');
    }

    if (d.completedTasks && d.completedTasks.length > 0) {
      lines.push('Recent tasks:');
      d.completedTasks.slice(0, 5).forEach((t, i) => {
        const date = new Date(t.completedAt).toLocaleDateString();
        lines.push(`  ${i + 1}. [${date}] ${t.task.slice(0, 80)}`);
      });
    }

    return lines.join('\n');
  }

  // ── Clear context ─────────────────────────────────────────────────────────

  clear() {
    try {
      const file = projectFilePath(this.projectPath);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      this._data = null;
      return true;
    } catch { return false; }
  }
}

// Singleton for current working directory
let _instance = null;

function getProjectContext(projectPath) {
  if (!_instance || _instance.projectPath !== path.resolve(projectPath || process.cwd())) {
    _instance = new ProjectContextManager(projectPath || process.cwd());
  }
  return _instance;
}

module.exports = { ProjectContextManager, getProjectContext, detectTechStack };