// src/memory.js — Persistent project-level memory
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class MemoryStore {
  constructor(memoryFilePath = config.MEMORY_FILE) {
    this.memoryFilePath = memoryFilePath;
  }

  load() {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const raw = fs.readFileSync(this.memoryFilePath, 'utf8');
        try {
          return JSON.parse(raw);
        } catch {
          if (config.DEBUG) logger.dim('Memory file reset (invalid JSON)');
          return { version: 1, projects: {} };
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        logger.warn(`Failed to load memory: ${err.message}`);
      }
    }
    return { version: 1, projects: {} };
  }

  save(memory) {
    try {
      fs.mkdirSync(path.dirname(this.memoryFilePath), { recursive: true });
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(memory, null, 2), 'utf8');
    } catch (err) {
      logger.warn(`Failed to save memory: ${err.message}`);
    }
  }

  getProjectMemory(projectDir) {
    const memory = this.load();
    if (!memory.projects[projectDir]) {
      memory.projects[projectDir] = {
        lastSeen: new Date().toISOString(),
        filesCreated: [],
        techStack: [],
        patterns: [],
        completedTasks: [],
        errors: [],
        notes: []
      };
      this.save(memory);
    }
    return memory.projects[projectDir];
  }

  updateProjectMemory(projectDir, updates) {
    const memory = this.load();
    memory.projects[projectDir] = {
      ...this.getProjectMemory(projectDir),
      ...updates,
      lastSeen: new Date().toISOString()
    };
    this.save(memory);
  }

  recordFilesCreated(projectDir, filePaths) {
    try {
      const mem = this.getProjectMemory(projectDir);
      const updated = [...new Set([...mem.filesCreated, ...filePaths])].slice(-50);
      this.updateProjectMemory(projectDir, { filesCreated: updated });
    } catch (err) {
      // ignore
    }
  }

  recordTechStack(projectDir, packages) {
    try {
      const mem = this.getProjectMemory(projectDir);
      const updated = [...new Set([...mem.techStack, ...packages])].slice(-30);
      this.updateProjectMemory(projectDir, { techStack: updated });
    } catch (err) {
      // ignore
    }
  }

  recordCompletedTask(projectDir, taskSummary) {
    try {
      const mem = this.getProjectMemory(projectDir);
      const updated = [taskSummary, ...mem.completedTasks.filter(t => t !== taskSummary)].slice(0, 20);
      this.updateProjectMemory(projectDir, { completedTasks: updated });
    } catch (err) {
      // ignore
    }
  }

  recordError(projectDir, errorSummary) {
    try {
      const mem = this.getProjectMemory(projectDir);
      const updated = [errorSummary, ...mem.errors.filter(e => e !== errorSummary)].slice(0, 10);
      this.updateProjectMemory(projectDir, { errors: updated });
    } catch (err) {
      // ignore
    }
  }

  recordPattern(projectDir, pattern) {
    const mem = this.getProjectMemory(projectDir);
    // Simple deduplication
    const updated = [...new Set([...mem.patterns, pattern])].slice(-15);
    this.updateProjectMemory(projectDir, { patterns: updated });
  }

  buildMemoryContext(projectDir) {
    if (!config.MEMORY_ENABLED) return '';
    const mem = this.load().projects[projectDir];
    if (!mem) return '';

    const lastSeen = Math.floor((new Date() - new Date(mem.lastSeen)) / (1000 * 60 * 60 * 24));
    
    return [
      '=== PROJECT MEMORY ===',
      `Last worked on: ${lastSeen} days ago`,
      mem.techStack.length > 0 ? `Tech stack: ${mem.techStack.join(', ')}` : '',
      mem.filesCreated.length > 0 ? `Files previously created: ${mem.filesCreated.slice(0, 10).join(', ')} (${mem.filesCreated.length} total)` : '',
      mem.completedTasks.length > 0 ? `Completed tasks: ${mem.completedTasks.join('; ')}` : '',
      mem.patterns.length > 0 ? `Known patterns: ${mem.patterns.join('; ')}` : '',
      mem.errors.length > 0 ? `Past errors to avoid: ${mem.errors.join('; ')}` : '',
      '====================='
    ].filter(Boolean).join('\n');
  }

  extractTechStackFromFiles(projectDir) {
    // Basic scan of common files
    const packages = [];
    const files = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod'];
    
    for (const file of files) {
      const abs = path.join(projectDir, file);
      try {
        if (fs.existsSync(abs)) {
          const content = fs.readFileSync(abs, 'utf8');
          if (file === 'package.json') {
            try {
              const pkg = JSON.parse(content);
              Object.keys(pkg.dependencies || {}).forEach(d => packages.push(d));
              Object.keys(pkg.devDependencies || {}).forEach(d => packages.push(d));
            } catch {}
          } else {
            // Simple heuristic for other files
            content.split('\n').forEach(line => {
              const match = line.match(/^([a-z0-9_-]+)/i);
              if (match) packages.push(match[1]);
            });
          }
        }
      } catch (err) {
        // Ignore read failures for tech stack extraction
      }
    }
    
    if (packages.length > 0) {
      this.recordTechStack(projectDir, packages.filter(p => p.length > 2 && p.length < 20));
    }
  }

  clearProjectMemory(projectDir) {
    const memory = this.load();
    delete memory.projects[projectDir];
    this.save(memory);
  }

  clearAllMemory() {
    this.save({ version: 1, projects: {} });
  }
}

module.exports = { MemoryStore };
