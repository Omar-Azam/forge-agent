// src/tools.js — All tools available to the AI agent
'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const http          = require('http');
const https         = require('https');
const config        = require('./config');
const { Errors, classifyFsError, classifyCommandError } = require('./errors');
const { withNetworkRetry }  = require('./retry');
const { searchCodebase, formatSearchResult } = require('./searcher');
const { runTests, detectFramework, formatTestResult } = require('./test-runner');
const { installPackage, installPackages, detectManager, formatInstallResult } = require('./package-manager');
const { generateDiff, diffFiles: diffFilesHelper, applyPatch, diffStats, summariseDiff, parseDiff } = require('./differ');
const { readEnvFile, setEnvVar, deleteEnvVar, findEnvFiles, checkRequiredVars, formatEnvReadResult } = require('./env-manager');
const { startProcess, stopProcess, getProcessStatus, listProcesses, getProcessLogs, waitForReady, formatProcessList, formatProcessLogs } = require('./process-manager');
const { takeScreenshot } = require('./screenshot');
const { readClipboard, writeClipboard } = require('./clipboard');
const { loadAllPlugins } = require('./plugin-loader');
const ToolCache = require('./tool-cache');
const { smartTruncate } = require('./truncator');
const security = require('./security');
const os = require('os');

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Create the module-level cache instance */
const cache = new ToolCache({
  enabled: config.CACHE_ENABLED,
  defaultTtlMs: config.CACHE_TTL_MS,
  maxEntries: config.CACHE_MAX_ENTRIES
});

/** Smartly truncate long strings based on content type */
function truncate(str, max = config.MAX_OUTPUT_LENGTH, type = 'text') {
  return smartTruncate(str, max, { type });
}

/** Resolve a path relative to the working directory */
function resolve(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(config.WORKING_DIR, filePath);
}

/**
 * Validate that a resolved path is safe to access.
 *
 * Rules:
 *  1. Must not be a known sensitive system path
 *  2. Warns (but allows) paths outside the working directory
 *     so the AI can still read docs, package files, etc.
 *
 * For a stricter sandbox, set STRICT_SANDBOX=true in config
 * which blocks ALL access outside the working directory.
 */
const BLOCKED_PATHS = security.BLOCKED_PATHS;

function assertSafePath(filePath, operation = 'access') {
  const validation = security.validatePath(filePath);
  if (!validation.safe) {
    const err = new Error(validation.reason);
    err.retryable = false;
    throw err;
  }
  return resolve(filePath);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Convert a glob pattern (e.g. "*.js", "test_*") to a RegExp.
 * Works on all platforms — no shell required.
 */
function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars
    .replace(/\*/g, '.*')                    // * → .*
    .replace(/\?/g, '.');                    // ? → .
  return new RegExp('^' + escaped + '$', 'i');
}

// ─────────────────────────────────────────────
//  Git helpers
// ─────────────────────────────────────────────

/** Run a git command and return stdout, throws on failure */
function runGit(cmd, cwd) {
  return execSync(cmd, {
    cwd,
    encoding  : 'utf8',
    timeout   : 15_000,
    stdio     : ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Run a git command, return empty string on failure (for optional fields) */
function safeGit(cmd, cwd) {
  try { return runGit(cmd, cwd); } catch { return ''; }
}

/** Throw a clear error if the directory is not a git repo */
function assertIsGitRepo(cwd) {
  const isRepo = safeGit('git rev-parse --git-dir', cwd);
  if (!isRepo) {
    const err = new Error(
      `Not a git repository: ${cwd}\n` +
      'Run "git init" to initialise one, or set --dir to a directory that contains a .git folder.'
    );
    err.retryable = false;
    throw err;
  }
}

// ─────────────────────────────────────────────
//  Tool definitions
// ─────────────────────────────────────────────

const TOOLS = {

  // ── File Reading ────────────────────────────────────────────────────────────
  read_file: {
    description: 'Read the full contents of a file. Optionally read specific line ranges.',
    parameters: {
      path        : { type: 'string',  required: true,  description: 'Path to the file' },
      start_line  : { type: 'number',  required: false, description: 'First line to read (1-indexed)' },
      end_line    : { type: 'number',  required: false, description: 'Last line to read (inclusive)' },
    },
    async execute({ path: filePath, start_line, end_line }) {
      const abs = assertSafePath(filePath, 'read');
      if (!fs.existsSync(abs))             throw Errors.fileNotFound(filePath);
      if (fs.statSync(abs).isDirectory())  throw Errors.pathIsDirectory(filePath);

      // Fix 7 — Auto-detect and mask .env files
      if (security.isEnvFile(filePath) && !config.ALLOW_ENV_PLAIN_READ) {
        const envResult = readEnvFile(abs, {});
        return envResult.vars
          .map(v => `${v.key}=${v.masked ? v.value + ' (masked)' : v.value}`)
          .join('\n');
      }

      let content;
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch (err) {
        throw classifyFsError(err, filePath, 'read');
      }

      // Fix 8 — Warn when reading files that commonly contain secrets
      const warning = security.checkSensitiveFileType(filePath);

      if (start_line != null || end_line != null) {
        const lines = content.split('\n');
        const s = Math.max(0, (start_line || 1) - 1);
        const e = end_line != null ? end_line : lines.length;
        content = lines.slice(s, e).map((l, i) => `${s + i + 1}: ${l}`).join('\n');
        const type = /\.(js|ts|py|c|cpp|go|rb|rs|php|java|html|css|sh)$/i.test(filePath) ? 'code' : 'text';
        const result = `[${filePath} | lines ${s + 1}–${e}]\n${truncate(content, config.MAX_OUTPUT_LENGTH, type)}`;
        return warning ? warning + '\n\n' + result : result;
      }

      // Add line numbers for large files to help the AI reference lines
      const lineCount = content.split('\n').length;
      let output;
      if (lineCount <= 300) {
        const numbered = content.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
        output = `[${filePath} | ${lineCount} lines]\n${numbered}`;
      } else {
        const type = /\.(js|ts|py|c|cpp|go|rb|rs|php|java|html|css|sh)$/i.test(filePath) ? 'code' : 'text';
        output = `[${filePath} | ${lineCount} lines — use start_line/end_line to read sections]\n${truncate(content, config.MAX_OUTPUT_LENGTH, type)}`;
      }
      return warning ? warning + '\n\n' + output : output;
    },
  },

  // ── File Writing ────────────────────────────────────────────────────────────
  write_file: {
    description: 'Write (create or overwrite) a file with given content. Creates parent directories automatically.',
    parameters: {
      path    : { type: 'string', required: true, description: 'Destination file path' },
      content : { type: 'string', required: true, description: 'Full file content to write' },
    },
    async execute({ path: filePath, content }) {
      const abs = assertSafePath(filePath, 'write');
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
      } catch (err) {
        throw classifyFsError(err, filePath, 'write');
      }
      const lineCount = content.split('\n').length;
      return `✓ Wrote ${formatBytes(Buffer.byteLength(content, 'utf8'))} (${lineCount} lines) → ${filePath}`;
    },
  },

  // ── Append to File ──────────────────────────────────────────────────────────
  append_to_file: {
    description: 'Append text to the end of an existing file (or create it if missing).',
    parameters: {
      path    : { type: 'string', required: true, description: 'File path' },
      content : { type: 'string', required: true, description: 'Text to append' },
    },
    async execute({ path: filePath, content }) {
      const abs = assertSafePath(filePath, 'append');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.appendFileSync(abs, content, 'utf8');
      return `✓ Appended ${formatBytes(Buffer.byteLength(content, 'utf8'))} to ${filePath}`;
    },
  },

  // ── Find & Replace in File ──────────────────────────────────────────────────
  replace_in_file: {
    description: 'Find and replace text in a file. Supports regex patterns.',
    parameters: {
      path           : { type: 'string',  required: true,  description: 'File path' },
      find           : { type: 'string',  required: true,  description: 'Text to find' },
      replace        : { type: 'string',  required: true,  description: 'Replacement text' },
      use_regex      : { type: 'boolean', required: false, description: 'Treat "find" as a regex pattern (default: false)' },
      all_occurrences: { type: 'boolean', required: false, description: 'Replace all occurrences (default: true)' },
    },
    async execute({ path: filePath, find, replace, use_regex = false, all_occurrences = true }) {
      const abs     = resolve(filePath);
      let   content = fs.readFileSync(abs, 'utf8');
      const original = content;

      if (use_regex) {
        const re = new RegExp(find, all_occurrences ? 'g' : '');
        content = content.replace(re, replace);
      } else if (all_occurrences) {
        content = content.split(find).join(replace);
      } else {
        content = content.replace(find, replace);
      }

      if (content === original) {
        return `⚠ No matches found for "${find}" in ${filePath}`;
      }

      const count = (original.match(
        new RegExp(use_regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      ) || []).length;

      fs.writeFileSync(abs, content, 'utf8');
      return `✓ Replaced ${count} occurrence(s) of "${find}" in ${filePath}`;
    },
  },

  // ── Delete File ─────────────────────────────────────────────────────────────
  delete_file: {
    description: 'Permanently delete a file.',
    parameters: {
      path: { type: 'string', required: true, description: 'File to delete' },
    },
    async execute({ path: filePath }) {
      const abs = assertSafePath(filePath, 'delete');
      if (!fs.existsSync(abs)) throw Errors.fileNotFound(filePath);
      try {
        fs.unlinkSync(abs);
      } catch (err) {
        throw classifyFsError(err, filePath, 'delete');
      }
      return `✓ Deleted ${filePath}`;
    },
  },

  // ── List Directory ──────────────────────────────────────────────────────────
  list_directory: {
    description: 'List files and folders in a directory, optionally recursive.',
    parameters: {
      path        : { type: 'string',  required: false, description: 'Directory to list (default: working dir)' },
      recursive   : { type: 'boolean', required: false, description: 'Recurse into sub-directories (default: false)' },
      show_hidden : { type: 'boolean', required: false, description: 'Include hidden files starting with . (default: false)' },
    },
    async execute({ path: dirPath = '.', recursive = false, show_hidden = false }) {
      const abs = resolve(dirPath);
      if (!fs.existsSync(abs))             throw Errors.directoryNotFound(dirPath);
      if (!fs.statSync(abs).isDirectory()) throw Errors.pathIsNotDirectory(dirPath);

      if (recursive) {
        const results = [];
        function walk(dir, depth) {
          if (depth > 10) return; // guard against infinite symlink loops
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
          catch { return; }
          for (const e of entries) {
            if (!show_hidden && e.name.startsWith('.')) continue;
            if (['node_modules', '.git', 'dist', '.next', 'build'].includes(e.name)) continue;
            const full = path.join(dir, e.name);
            results.push(full);
            if (e.isDirectory()) walk(full, depth + 1);
            if (results.length >= 300) return;
          }
        }
        walk(abs, 0);
        if (results.length === 0) return '(empty)';
        const out = results.map(p => p.replace(abs + path.sep, '')).sort().join('\n');
        return truncate(out, config.MAX_OUTPUT_LENGTH, 'file_list');
      }

      const entries = fs.readdirSync(abs, { withFileTypes: true });
      const visible = show_hidden ? entries : entries.filter(e => !e.name.startsWith('.'));
      visible.sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      if (visible.length === 0) return `(empty directory: ${dirPath})`;

      const lines = visible.map(e => {
        if (e.isDirectory()) {
          return `📁  ${e.name}/`;
        }
        try {
          const size = fs.statSync(path.join(abs, e.name)).size;
          return `📄  ${e.name}  ${formatBytes(size)}`;
        } catch {
          return `📄  ${e.name}`;
        }
      });

      const out = `[${dirPath}] — ${visible.length} items\n${lines.join('\n')}`;
      return truncate(out, config.MAX_OUTPUT_LENGTH, 'file_list');
    },
  },

  // ── Create Directory ────────────────────────────────────────────────────────
  create_directory: {
    description: 'Create a directory (and all necessary parent directories).',
    parameters: {
      path: { type: 'string', required: true, description: 'Directory path to create' },
    },
    async execute({ path: dirPath }) {
      const abs = resolve(dirPath);
      fs.mkdirSync(abs, { recursive: true });
      return `✓ Created directory: ${dirPath}`;
    },
  },

  // ── Move / Rename ───────────────────────────────────────────────────────────
  move_file: {
    description: 'Move or rename a file or directory.',
    parameters: {
      source      : { type: 'string', required: true, description: 'Source path' },
      destination : { type: 'string', required: true, description: 'Destination path' },
    },
    async execute({ source, destination }) {
      const src  = resolve(source);
      const dest = resolve(destination);
      if (!fs.existsSync(src)) throw Errors.fileNotFound(source);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(src, dest);
      } catch (err) {
        throw classifyFsError(err, destination, 'move');
      }
      return `✓ Moved: ${source} → ${destination}`;
    },
  },

  // ── Copy File ───────────────────────────────────────────────────────────────
  copy_file: {
    description: 'Copy a file to a new location.',
    parameters: {
      source      : { type: 'string', required: true, description: 'Source file path' },
      destination : { type: 'string', required: true, description: 'Destination file path' },
    },
    async execute({ source, destination }) {
      const src  = resolve(source);
      const dest = resolve(destination);
      if (!fs.existsSync(src)) throw Errors.fileNotFound(source);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      } catch (err) {
        throw classifyFsError(err, destination, 'copy');
      }
      return `✓ Copied: ${source} → ${destination}`;
    },
  },

  // ── File Info ───────────────────────────────────────────────────────────────
  get_file_info: {
    description: 'Get metadata about a file or directory (size, modified date, line count, etc.).',
    parameters: {
      path: { type: 'string', required: true, description: 'File or directory path' },
    },
    async execute({ path: filePath }) {
      const abs = assertSafePath(filePath, 'stat');
      if (!fs.existsSync(abs)) throw Errors.fileNotFound(filePath);
      const stat = fs.statSync(abs);
      const info = {
        path        : abs,
        type        : stat.isDirectory() ? 'directory' : 'file',
        size        : stat.size,
        size_human  : formatBytes(stat.size),
        modified    : stat.mtime.toISOString(),
        created     : stat.birthtime.toISOString(),
        permissions : `0${(stat.mode & 0o777).toString(8)}`,
      };
      if (stat.isFile()) {
        try {
          const content = fs.readFileSync(abs, 'utf8');
          info.lines = content.split('\n').length;
          info.encoding = 'utf-8';
        } catch {
          info.lines = 0;
          info.encoding = 'unknown';
        }
      }
      return JSON.stringify(info, null, 2);
    },
  },

  // ── Run Command ─────────────────────────────────────────────────────────────
  run_command: {
    description: 'Execute a shell command and return its output. Runs in the working directory by default.',
    parameters: {
      command : { type: 'string',  required: true,  description: 'Shell command to run' },
      cwd     : { type: 'string',  required: false, description: 'Working directory for the command' },
      timeout : { type: 'number',  required: false, description: 'Timeout in milliseconds (default: 60000)' },
      env     : { type: 'object',  required: false, description: 'Extra environment variables as key-value pairs' },
    },
    async execute({ command, cwd, timeout, env = {} }) {
      const workDir = cwd ? resolve(cwd) : config.WORKING_DIR;

      // Fix 5 — Block dangerous commands
      if (!config.ALLOW_DANGEROUS_COMMANDS) {
        const validation = security.validateCommand(command);
        if (!validation.safe) {
          const err = new Error(validation.reason);
          err.retryable = false;
          throw err;
        }
      }

      // Read timeout from config at execution time — not cached
      const timeoutMs = timeout 
        || (config.TOOL_TIMEOUT || 300_000);

      if (config.DEBUG) {
        logger.dim(`[run_command] Executing: ${command} (cwd: ${workDir})`);
      }

      try {
        const output = execSync(command, {
          cwd         : workDir,
          encoding    : 'utf8',
          timeout     : timeoutMs,
          maxBuffer   : 20 * 1024 * 1024,
          env         : { ...process.env, ...env },
          stdio       : ['pipe', 'pipe', 'pipe'],
        });
        const result = (output || '').trim();
        return truncate(result || '(command completed with no output)', config.MAX_OUTPUT_LENGTH, 'command_output');
      } catch (err) {
        throw classifyCommandError(err, command);
      }
    },
  },

  // ── Find Files ──────────────────────────────────────────────────────────────
  find_files: {
    description: 'Search for files by name pattern (glob-style, e.g. "*.js", "test_*").',
    parameters: {
      pattern   : { type: 'string', required: true,  description: 'Filename pattern (e.g. "*.ts")' },
      directory : { type: 'string', required: false, description: 'Directory to search (default: working dir)' },
      exclude   : { type: 'string', required: false, description: 'Pattern to exclude from results' },
    },
    async execute({ pattern, directory = '.', exclude }) {
      const dir     = resolve(directory);
      const regex   = globToRegex(pattern);
      const results = [];
      const SKIP    = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

      function walk(current) {
        if (results.length >= 100) return;
        let entries;
        try { entries = fs.readdirSync(current, { withFileTypes: true }); }
        catch { return; }
        for (const e of entries) {
          if (SKIP.has(e.name)) continue;
          const full = path.join(current, e.name);
          if (e.isDirectory()) {
            walk(full);
          } else if (regex.test(e.name)) {
            if (!exclude || !full.includes(exclude)) {
              results.push(full);
            }
          }
        }
      }

      walk(dir);
      if (results.length === 0) return `No files matching "${pattern}" in ${directory}`;
      return results.sort().join('\n');
    },
  },

  // ── Search in Files ──────────────────────────────────────────────────────────
  search_in_files: {
    description: 'Search for text patterns inside files (like grep -r). Returns matching lines with filenames.',
    parameters: {
      pattern       : { type: 'string',  required: true,  description: 'Text or regex to search for' },
      directory     : { type: 'string',  required: false, description: 'Directory to search (default: working dir)' },
      file_pattern  : { type: 'string',  required: false, description: 'Only search files matching this (e.g. "*.js")' },
      case_sensitive: { type: 'boolean', required: false, description: 'Case-sensitive search (default: false)' },
      context_lines : { type: 'number',  required: false, description: 'Lines of context around each match (default: 2)' },
    },
    async execute({ pattern, directory = '.', file_pattern, case_sensitive = false, context_lines = 2 }) {
      const dir      = resolve(directory);
      const flags    = case_sensitive ? '' : 'i';
      const regex    = new RegExp(pattern, flags);
      const fileRe   = file_pattern ? globToRegex(file_pattern) : null;
      const SKIP     = new Set(['node_modules', '.git', 'dist', '.next', 'build']);
      const matches  = [];
      const MAX      = 150;

      function walk(current) {
        if (matches.length >= MAX) return;
        let entries;
        try { entries = fs.readdirSync(current, { withFileTypes: true }); }
        catch { return; }

        for (const e of entries) {
          if (SKIP.has(e.name)) continue;
          const full = path.join(current, e.name);

          if (e.isDirectory()) {
            walk(full);
            continue;
          }

          if (fileRe && !fileRe.test(e.name)) continue;

          // Skip binary files by extension
          const ext = path.extname(e.name).toLowerCase();
          if (['.png','.jpg','.jpeg','.gif','.ico','.pdf','.zip',
               '.gz','.tar','.woff','.woff2','.ttf','.eot',
               '.mp4','.mp3','.exe','.dll','.so'].includes(ext)) continue;

          let content;
          try { content = fs.readFileSync(full, 'utf8'); }
          catch { continue; }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const ctxStart = Math.max(0, i - context_lines);
              const ctxEnd   = Math.min(lines.length - 1, i + context_lines);
              const block    = [];

              for (let j = ctxStart; j <= ctxEnd; j++) {
                const prefix = j === i ? '>' : ' ';
                block.push(`${full}:${j + 1}${prefix} ${lines[j]}`);
              }

              matches.push(block.join('\n'));
              if (matches.length >= MAX) break;
            }
          }
        }
      }

      walk(dir);

      if (matches.length === 0) return `No matches found for: ${pattern}`;
      const result = matches.join('\n' + '─'.repeat(40) + '\n');
      return truncate(result, config.MAX_OUTPUT_LENGTH, 'text');
    },
  },

  // ── Fetch URL ───────────────────────────────────────────────────────────────
  read_url: {
    description: 'Fetch the text content of a URL (useful for reading documentation, APIs, etc.).',
    parameters: {
      url: { type: 'string', required: true, description: 'Full URL to fetch (http or https)' },
    },
    async execute({ url }) {
      return withNetworkRetry(() => new Promise((resolve_p, reject) => {
        const client  = url.startsWith('https') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ForgeAgent/1.0)',
            'Accept'    : 'text/html,text/plain,application/json',
          },
        };

        const req = client.get(url, options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return TOOLS.read_url.execute({ url: res.headers.location }).then(resolve_p).catch(reject);
          }

          // Retry on 5xx
          if (res.statusCode >= 500) {
            const err = new Error(`HTTP ${res.statusCode} from ${url}`);
            err.retryable = true;
            return reject(err);
          }

          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            const text = data
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s{3,}/g, '\n\n')
              .trim();
            resolve_p(truncate(text, config.MAX_OUTPUT_LENGTH, 'text'));
          });
        });

        req.on('error', err => {
          err.retryable = true;
          reject(Errors.urlFetchFailed(url, err));
        });
        req.setTimeout(15_000, () => {
          req.destroy();
          reject(Errors.urlTimeout(url));
        });
      }), `fetch ${url}`);
    },
  },

  // ── Write Multiple Files (batch) ────────────────────────────────────────────
  write_files: {
    description: 'Write multiple files at once — useful for scaffolding projects.',
    parameters: {
      files: {
        type       : 'array',
        required   : true,
        description: 'Array of {path, content} objects',
      },
    },
    async execute({ files }) {
      if (!Array.isArray(files)) throw new Error('"files" must be an array of {path, content}');
      const results = [];
      for (const item of files) {
        if (!item || !item.path) {
          logger.warn('write_files: item missing path, skipping');
          continue;
        }
        const filePath = item.path;
        const content  = item.content || '';
        const abs = resolve(filePath);
        try {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content, 'utf8');
        } catch (err) {
          throw classifyFsError(err, filePath, 'write');
        }
        results.push(`✓ ${filePath}`);
      }
      return `Wrote ${results.length} files:\n${results.join('\n')}`;
    },
  },

  // ── Git Status ──────────────────────────────────────────────────────────────
  git_status: {
    description: 'Show the working tree status — staged, unstaged, and untracked files. Also shows current branch and whether it is ahead/behind remote.',
    parameters: {
      directory: { type: 'string', required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ directory } = {}) {
      const cwd = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      try {
        const branch  = runGit('git rev-parse --abbrev-ref HEAD', cwd);
        const status  = runGit('git status --short', cwd);
        const ahead   = safeGit('git rev-list --count @{u}..HEAD 2>/dev/null', cwd);
        const behind  = safeGit('git rev-list --count HEAD..@{u} 2>/dev/null', cwd);

        const lines = [`Branch: ${branch}`];
        if (ahead && ahead !== '0')  lines.push(`Ahead of remote by ${ahead} commit(s)`);
        if (behind && behind !== '0') lines.push(`Behind remote by ${behind} commit(s)`);
        lines.push('');
        lines.push(status || '(working tree clean)');
        return truncate(lines.join('\n'), config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git status');
      }
    },
  },

  // ── Git Log ─────────────────────────────────────────────────────────────────
  git_log: {
    description: 'Show recent commit history with author, date, and message.',
    parameters: {
      limit    : { type: 'number',  required: false, description: 'Number of commits to show (default: 10)' },
      branch   : { type: 'string',  required: false, description: 'Branch or ref to show log for (default: HEAD)' },
      file     : { type: 'string',  required: false, description: 'Show only commits that touched this file' },
      directory: { type: 'string',  required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ limit = 10, branch = 'HEAD', file, directory } = {}) {
      const cwd = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      const fileArg = file ? `-- "${file}"` : '';
      const cmd     = `git log ${branch} --oneline --decorate -n ${limit} ${fileArg}`;
      try {
        const out = runGit(cmd, cwd);
        return truncate(out || '(no commits found)', config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git log');
      }
    },
  },

  // ── Git Diff ────────────────────────────────────────────────────────────────
  git_diff: {
    description: 'Show changes between commits, working tree and index, or two branches. Great for understanding what changed before modifying files.',
    parameters: {
      target   : { type: 'string',  required: false, description: 'What to diff: "staged" | "HEAD" | commit hash | branch name (default: unstaged changes)' },
      file     : { type: 'string',  required: false, description: 'Limit diff to a specific file' },
      directory: { type: 'string',  required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ target, file, directory } = {}) {
      const cwd     = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      const fileArg = file ? `-- "${file}"` : '';

      let cmd;
      if (!target || target === 'unstaged') {
        cmd = `git diff ${fileArg}`;
      } else if (target === 'staged') {
        cmd = `git diff --cached ${fileArg}`;
      } else if (target === 'HEAD') {
        cmd = `git diff HEAD ${fileArg}`;
      } else {
        cmd = `git diff ${target} ${fileArg}`;
      }

      try {
        const out = runGit(cmd, cwd);
        return truncate(out || '(no differences)', config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git diff');
      }
    },
  },

  // ── Git Branches ─────────────────────────────────────────────────────────────
  git_branches: {
    description: 'List all local (and optionally remote) branches, showing which is currently checked out.',
    parameters: {
      include_remote: { type: 'boolean', required: false, description: 'Include remote branches (default: false)' },
      directory     : { type: 'string',  required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ include_remote = false, directory } = {}) {
      const cwd = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      const flag = include_remote ? '-a' : '';
      try {
        const out = runGit(`git branch ${flag} --sort=-committerdate`, cwd);
        return truncate(out || '(no branches)', config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git branch');
      }
    },
  },

  // ── Git Show ─────────────────────────────────────────────────────────────────
  git_show: {
    description: 'Show the full details of a specific commit — message, author, date, and diff.',
    parameters: {
      ref      : { type: 'string',  required: false, description: 'Commit hash, tag, or branch (default: HEAD)' },
      directory: { type: 'string',  required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ ref = 'HEAD', directory } = {}) {
      const cwd = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      try {
        const out = runGit(`git show --stat ${ref}`, cwd);
        return truncate(out, config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git show');
      }
    },
  },

  // ── Git Blame ────────────────────────────────────────────────────────────────
  git_blame: {
    description: 'Show who last modified each line of a file and in which commit. Useful for understanding why code was written a certain way.',
    parameters: {
      path       : { type: 'string', required: true,  description: 'File path to blame' },
      start_line : { type: 'number', required: false, description: 'First line to show (default: start of file)' },
      end_line   : { type: 'number', required: false, description: 'Last line to show (default: end of file)' },
      directory  : { type: 'string', required: false, description: 'Git repo directory (default: working dir)' },
    },
    async execute({ path: filePath, start_line, end_line, directory } = {}) {
      const cwd = directory ? resolve(directory) : config.WORKING_DIR;
      assertIsGitRepo(cwd);
      const abs     = resolve(filePath);
      const lineArg = (start_line && end_line)
        ? `-L ${start_line},${end_line}`
        : start_line ? `-L ${start_line},+20` : '';
      try {
        const out = runGit(`git blame ${lineArg} "${abs}"`, cwd);
        return truncate(out, config.MAX_OUTPUT_LENGTH, 'git_output');
      } catch (err) {
        throw classifyCommandError(err, 'git blame');
      }
    },
  },

  // ── Search Codebase (semantic) ───────────────────────────────────────────────
  search_codebase: {
    description: 'Intelligent multi-file codebase search. Finds functions, classes, variables, and text by name or meaning. Ranks results by relevance and supports fuzzy matching. Use this instead of search_in_files when you want to find where something is defined or used across the whole project.',
    parameters: {
      query    : { type: 'string',  required: true,  description: 'What to search for — a function name, class, keyword, or concept' },
      directory: { type: 'string',  required: false, description: 'Root directory to search (default: working dir)' },
      type     : { type: 'string',  required: false, description: 'Search type: "symbol" (functions/classes), "text" (exact text), "file" (filenames), or "auto" (all three, default)' },
      ext      : { type: 'string',  required: false, description: 'Limit to files with this extension, e.g. ".js" or ".py"' },
      limit    : { type: 'number',  required: false, description: 'Max results to return (default: 20)' },
      fuzzy    : { type: 'boolean', required: false, description: 'Enable fuzzy/partial name matching (default: true)' },
    },
    async execute({ query, directory, type = 'auto', ext, limit = 20, fuzzy = true }) {
      const dir = resolve(directory || config.WORKING_DIR);
      try {
        const result = searchCodebase(query, dir, { type, ext, limit, fuzzy });
        return truncate(formatSearchResult(result), config.MAX_OUTPUT_LENGTH, 'text');
      } catch (err) {
        throw new Error(`Codebase search failed: ${err.message}`);
      }
    },
  },

  // ── Run Tests ────────────────────────────────────────────────────────────────
  run_tests: {
    description: 'Run the project\'s test suite and return structured pass/fail results. Auto-detects Jest, Vitest, Mocha, pytest, Go test, and Cargo test. Use this after writing or modifying code to verify it works.',
    parameters: {
      directory : { type: 'string',  required: false, description: 'Project directory to run tests in (default: working dir)' },
      framework : { type: 'string',  required: false, description: 'Force a framework: "jest" | "vitest" | "mocha" | "pytest" | "go test" | "cargo test"' },
      file      : { type: 'string',  required: false, description: 'Run tests in a specific file only (e.g. "tests/auth.test.js")' },
      test_name : { type: 'string',  required: false, description: 'Run only tests whose name matches this string' },
      timeout   : { type: 'number',  required: false, description: 'Timeout in milliseconds (default: 120000)' },
    },
    async execute({ directory, framework, file, test_name, timeout } = {}) {
      const dir = resolve(directory || config.WORKING_DIR);

      if (!framework) {
        const detected = detectFramework(dir);
        if (!detected) {
          return [
            '⚠ No test framework detected in: ' + dir,
            '',
            'Supported frameworks: jest, vitest, mocha, pytest, unittest, go test, cargo test',
            '',
            'To run tests:',
            '  1. Make sure your test framework is installed (e.g. npm install --save-dev jest)',
            '  2. Add a test script to package.json: "test": "jest"',
            '  3. Or specify the framework explicitly with the "framework" parameter',
          ].join('\n');
        }
      }

      try {
        const result = runTests(dir, {
          framework,
          file,
          testName: test_name,
          timeout,
        });
        return truncate(formatTestResult(result), config.MAX_OUTPUT_LENGTH, 'test_output');
      } catch (err) {
        throw new Error(`Test runner failed: ${err.message}`);
      }
    },
  },

  // ── Install Package ───────────────────────────────────────────────────────────
  install_package: {
    description: 'Install one or more packages using the project\'s package manager. Auto-detects npm/yarn/pnpm/pip/cargo/go. Checks if already installed before running. Supports dev dependencies and specific versions.',
    parameters: {
      packages  : { type: 'array',   required: true,  description: 'Package name(s) to install. Either ["pkg1","pkg2"] or [{"name":"pkg","version":"1.0.0"}]' },
      directory : { type: 'string',  required: false, description: 'Project directory (default: working dir)' },
      dev       : { type: 'boolean', required: false, description: 'Install as dev/development dependency (default: false)' },
      manager   : { type: 'string',  required: false, description: 'Force a specific manager: "npm"|"yarn"|"pnpm"|"pip"|"cargo"|"go"' },
      version   : { type: 'string',  required: false, description: 'Version to install for single package (e.g. "4.18.0", "^4.0.0")' },
    },
    async execute({ packages, directory, dev = false, manager, version } = {}) {
      const dir = resolve(directory || config.WORKING_DIR);

      if (!packages || !Array.isArray(packages) || packages.length === 0) {
        throw new Error('"packages" must be a non-empty array of package names');
      }

      if (!manager) {
        const detected = detectManager(dir);
        if (!detected) {
          return [
            '⚠ No package manager detected in: ' + dir,
            '',
            'Create one of these files first:',
            '  • package.json  (npm/yarn/pnpm)',
            '  • requirements.txt or pyproject.toml  (pip)',
            '  • Cargo.toml  (cargo)',
            '  • go.mod  (go)',
          ].join('\n');
        }
      }

      try {
        if (packages.length === 1) {
          const pkg = typeof packages[0] === 'string' ? packages[0] : packages[0].name;
          const ver = version || (typeof packages[0] === 'object' ? packages[0].version : null);
          const result = installPackage(pkg, dir, { version: ver, dev, manager });
          return formatInstallResult(result);
        }
        const result = installPackages(packages, dir, { dev, manager });
        return formatInstallResult(result);
      } catch (err) {
        throw new Error(`Package install failed: ${err.message}`);
      }
    },
  },

  // ── Diff Files ────────────────────────────────────────────────────────────────
  diff_files: {
    description: 'Generate a unified diff showing the differences between two files, or between current and new content for a single file. Use this to preview changes before applying them.',
    parameters: {
      path_a   : { type: 'string', required: true,  description: 'Path to the original file (or any file to compare)' },
      path_b   : { type: 'string', required: false, description: 'Path to the new file (omit to diff path_a against new_content)' },
      new_content: { type: 'string', required: false, description: 'New content to diff against path_a (used when path_b is omitted)' },
    },
    async execute({ path_a, path_b, new_content }) {
      const absA = assertSafePath(path_a, 'read');

      if (!fs.existsSync(absA)) throw Errors.fileNotFound(path_a);

      const aContent = fs.readFileSync(absA, 'utf8');

      let bContent;
      let bLabel;

      if (path_b) {
        const absB = assertSafePath(path_b, 'read');
        if (!fs.existsSync(absB)) throw Errors.fileNotFound(path_b);
        bContent = fs.readFileSync(absB, 'utf8');
        bLabel   = `b/${path.basename(path_b)}`;
      } else if (new_content !== undefined) {
        bContent = new_content;
        bLabel   = `b/${path.basename(path_a)}`;
      } else {
        throw new Error('Provide either path_b or new_content to diff against');
      }

      const diff = generateDiff(aContent, bContent, `a/${path.basename(path_a)}`, bLabel);

      if (!diff) return `No differences found — files are identical.`;

      const stats = diffStats(diff);
      const header = `${summariseDiff(diff, path_a)}\n`;
      return truncate(header + diff);
    },
  },

  // ── Patch File ────────────────────────────────────────────────────────────────
  patch_file: {
    description: 'Apply a unified diff patch to a file. More precise than write_file for small targeted changes — only modifies the lines specified in the patch.',
    parameters: {
      path   : { type: 'string',  required: true,  description: 'File to patch' },
      patch  : { type: 'string',  required: true,  description: 'Unified diff patch string (output from diff_files or git diff)' },
      reverse: { type: 'boolean', required: false, description: 'Apply patch in reverse to undo changes (default: false)' },
      dry_run: { type: 'boolean', required: false, description: 'Preview result without writing to disk (default: false)' },
    },
    async execute({ path: filePath, patch: patchText, reverse = false, dry_run = false }) {
      const abs = assertSafePath(filePath, 'write');
      if (!fs.existsSync(abs)) throw Errors.fileNotFound(filePath);

      const original = fs.readFileSync(abs, 'utf8');
      const parsed   = parseDiff(patchText);

      if (parsed.hunks.length === 0) {
        throw new Error('No valid hunks found in patch. Make sure it is a unified diff format.');
      }

      const result = applyPatch(original, patchText, { reverse, fuzzy: true });

      if (!result.success && result.errors.length > 0) {
        throw new Error(
          `Patch failed to apply cleanly:\n${result.errors.join('\n')}\n` +
          'Try using write_file or replace_in_file instead.'
        );
      }

      if (dry_run) {
        const stats = diffStats(patchText);
        return [
          '🔍 Dry run — patch would make these changes:',
          `  +${stats.additions} line(s) added`,
          `  -${stats.deletions} line(s) removed`,
          `  ${stats.hunks} hunk(s)`,
          '',
          'Run again with dry_run: false to apply.',
        ].join('\n');
      }

      // Create backup
      const backup = abs + '.orig';
      fs.writeFileSync(backup, original, 'utf8');

      // Write patched content
      fs.writeFileSync(abs, result.content, 'utf8');

      const stats = diffStats(patchText);
      const action = reverse ? 'Reversed' : 'Applied';
      return [
        `✓ ${action} patch to ${filePath}`,
        `  +${stats.additions} line(s) added, -${stats.deletions} line(s) removed`,
        `  Backup saved to ${path.basename(backup)}`,
      ].join('\n');
    },
  },

  // ── Read Env File ─────────────────────────────────────────────────────────────
  read_env: {
    description: 'Read variables from a .env file. Secret values (tokens, passwords, API keys) are automatically masked — they are never sent to the AI. Shows structure and non-secret values in full.',
    parameters: {
      path        : { type: 'string', required: false, description: 'Path to .env file (default: .env in working dir)' },
      reveal_keys : { type: 'array',  required: false, description: 'Specific variable names to show unmasked (use sparingly)' },
    },
    async execute({ path: filePath, reveal_keys = [] } = {}) {
      const abs    = resolve(filePath || '.env');
      const result = readEnvFile(abs, { revealKeys: reveal_keys });
      return formatEnvReadResult(result);
    },
  },

  // ── Set Env Var ───────────────────────────────────────────────────────────────
  set_env_var: {
    description: 'Set or update a single environment variable in a .env file. Creates the file if it does not exist. Never returns the actual value — confirms the action only.',
    parameters: {
      key    : { type: 'string', required: true,  description: 'Variable name (e.g. PORT, DATABASE_URL)' },
      value  : { type: 'string', required: true,  description: 'Variable value' },
      path   : { type: 'string', required: false, description: 'Path to .env file (default: .env in working dir)' },
      comment: { type: 'string', required: false, description: 'Optional comment to add above the variable' },
    },
    async execute({ key, value, path: filePath, comment } = {}) {
      const abs    = resolve(filePath || '.env');
      const result = setEnvVar(abs, key, value, { comment });
      const action = result.action === 'created' ? 'Created' : 'Updated';
      const note   = result.masked ? ' (value masked — secret detected)' : '';
      return `✓ ${action} ${key} in ${result.file}${note}`;
    },
  },

  // ── Delete Env Var ────────────────────────────────────────────────────────────
  delete_env_var: {
    description: 'Remove a variable from a .env file.',
    parameters: {
      key : { type: 'string', required: true,  description: 'Variable name to remove' },
      path: { type: 'string', required: false, description: 'Path to .env file (default: .env in working dir)' },
    },
    async execute({ key, path: filePath } = {}) {
      const abs    = resolve(filePath || '.env');
      const result = deleteEnvVar(abs, key);
      return result.deleted
        ? `✓ Removed ${key} from ${result.file}`
        : result.message;
    },
  },

  // ── List Env Files ────────────────────────────────────────────────────────────
  list_env_files: {
    description: 'Find all .env files in the project (.env, .env.local, .env.development, etc.) and list their variable names — values are always masked.',
    parameters: {
      directory: { type: 'string', required: false, description: 'Directory to search (default: working dir)' },
    },
    async execute({ directory } = {}) {
      const dir   = resolve(directory || config.WORKING_DIR);
      const files = findEnvFiles(dir);
      if (files.length === 0) return 'No .env files found in ' + dir;

      const lines = [`Found ${files.length} .env file(s):\n`];
      for (const file of files) {
        const result = readEnvFile(file);
        const rel    = path.relative(dir, file);
        lines.push(`📄 ${rel} — ${result.vars.length} variable(s)`);
        result.vars.forEach(v => lines.push(`   ${v.secret ? '🔒' : '  '} ${v.key}`));
        lines.push('');
      }
      return lines.join('\n');
    },
  },

  // ── Check Required Env ────────────────────────────────────────────────────────
  check_env_vars: {
    description: 'Verify that all required environment variables are present in a .env file. Returns which are missing and which are set.',
    parameters: {
      required : { type: 'array',  required: true,  description: 'List of required variable names to check for' },
      path     : { type: 'string', required: false, description: 'Path to .env file (default: .env in working dir)' },
    },
    async execute({ required: requiredKeys, path: filePath } = {}) {
      const abs    = resolve(filePath || '.env');
      const result = checkRequiredVars(abs, requiredKeys);
      const lines  = [];
      if (result.missing.length === 0) {
        lines.push(`✓ All ${requiredKeys.length} required variable(s) are set`);
      } else {
        lines.push(`⚠ ${result.missing.length} required variable(s) missing:`);
        result.missing.forEach(k => lines.push(`  ✗ ${k}`));
      }
      if (result.present.length > 0) {
        lines.push(`\n✓ Present (${result.present.length}):`);
        result.present.forEach(k => lines.push(`  ✓ ${k}`));
      }
      return lines.join('\n');
    },
  },

  // ── Start Process ─────────────────────────────────────────────────────────────
  start_process: {
    description: 'Start a long-running background process (dev server, watcher, build tool) and give it a name. The process runs in the background while the agent continues. Use read_process_logs to see its output.',
    parameters: {
      name     : { type: 'string',  required: true,  description: 'Unique name to identify this process (e.g. "dev-server", "watcher")' },
      command  : { type: 'string',  required: true,  description: 'Command to run (e.g. "npm run dev", "python server.py")' },
      directory: { type: 'string',  required: false, description: 'Working directory (default: working dir)' },
      wait_for : { type: 'string',  required: false, description: 'Regex pattern to wait for in output before returning (e.g. "listening on|ready|started")' },
      timeout  : { type: 'number',  required: false, description: 'Max ms to wait for wait_for pattern (default: 15000)' },
      replace  : { type: 'boolean', required: false, description: 'Replace if a process with this name is already running (default: false)' },
    },
    async execute({ name, command, directory, wait_for, timeout = 15_000, replace = false } = {}) {
      const cwd    = resolve(directory || config.WORKING_DIR);
      const result = startProcess(name, command, { cwd, replace });

      if (!result.started) return result.message;

      if (wait_for) {
        const ready = await waitForReady(name, wait_for, timeout);
        if (ready) {
          const logs = getProcessLogs(name, 10);
          return [
            result.message,
            `✓ Process ready (matched: "${wait_for}")`,
            '',
            'Recent output:',
            ...(logs || []),
          ].join('\n');
        } else {
          const status = getProcessStatus(name);
          if (status?.status === 'crashed') {
            const logs = getProcessLogs(name, 20);
            return [
              `⚠ Process "${name}" crashed before becoming ready.`,
              'Output:',
              ...(logs || ['(no output)']),
            ].join('\n');
          }
          return [
            result.message,
            `⚠ Timed out waiting for "${wait_for}" after ${timeout}ms`,
            'Process is still running. Use read_process_logs to check output.',
          ].join('\n');
        }
      }

      // Give it a moment then return recent logs
      await new Promise(r => setTimeout(r, 500));
      const logs = getProcessLogs(name, 10);
      return [
        result.message,
        '',
        'Initial output:',
        ...(logs?.length ? logs : ['(no output yet)']),
      ].join('\n');
    },
  },

  // ── Stop Process ──────────────────────────────────────────────────────────────
  stop_process: {
    description: 'Stop a background process started with start_process.',
    parameters: {
      name  : { type: 'string', required: true,  description: 'Process name to stop' },
      force : { type: 'boolean', required: false, description: 'Use SIGKILL instead of SIGTERM (default: false)' },
    },
    async execute({ name, force = false } = {}) {
      const result = stopProcess(name, force ? 'SIGKILL' : 'SIGTERM');
      return result.message;
    },
  },

  // ── List Processes ────────────────────────────────────────────────────────────
  list_processes: {
    description: 'List all background processes started in this session — name, status, PID, uptime, and command.',
    parameters: {},
    async execute() {
      return formatProcessList(listProcesses());
    },
  },

  // ── Read Process Logs ─────────────────────────────────────────────────────────
  read_process_logs: {
    description: 'Read recent output from a background process. Use this to check if a dev server started successfully, see errors, or monitor progress.',
    parameters: {
      name  : { type: 'string',  required: true,  description: 'Process name' },
      lines : { type: 'number',  required: false, description: 'Number of recent lines to return (default: 50)' },
      filter: { type: 'string',  required: false, description: 'Only show lines matching this text or regex' },
    },
    async execute({ name, lines = 50, filter } = {}) {
      const status = getProcessStatus(name);
      const logs   = getProcessLogs(name, lines, filter);
      return formatProcessLogs(name, logs, status?.status || 'unknown');
    },
  },

  // ── Take Screenshot ─────────────────────────────────────────────────────────
  take_screenshot: {
    description: 'Capture a screenshot of the entire screen. Useful for debugging UI issues or capturing visual state.',
    parameters: {
      path  : { type: 'string', required: false, description: 'Path to save the screenshot (default: screenshot.png)' },
      delay : { type: 'number', required: false, description: 'Delay in milliseconds before capture (default: 0)' },
    },
    async execute({ path: filePath = 'screenshot.png', delay = 0 } = {}) {
      const abs = assertSafePath(filePath, 'write');
      const result = takeScreenshot(abs, { delay });
      return result.message;
    },
  },

  // ── Read Clipboard ──────────────────────────────────────────────────────────
  read_clipboard: {
    description: 'Read the current text content from the system clipboard.',
    parameters: {},
    async execute() {
      return readClipboard();
    },
  },

  // ── Write Clipboard ─────────────────────────────────────────────────────────
  write_clipboard: {
    description: 'Write text to the system clipboard.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to copy to clipboard' },
    },
    async execute({ text }) {
      writeClipboard(text);
      return `✓ Copied ${text.length} character(s) to clipboard`;
    },
  },

};

// ── Load Custom Plugins ───────────────────────────────────────────────────────
if (fs.existsSync(config.PLUGIN_DIR)) {
  const { loaded, failed } = loadAllPlugins(config.PLUGIN_DIR, Object.keys(TOOLS));
  
  for (const plugin of loaded) {
    TOOLS[plugin.name] = plugin;
    logger.success(`Loaded custom plugin: ${plugin.name}`);
  }

  for (const fail of failed) {
    logger.warn(`Failed to load plugin ${fail.file}: ${fail.error}`);
  }
}

// ─────────────────────────────────────────────
//  Generate tool docs for the system prompt
// ─────────────────────────────────────────────
function getToolDescriptions() {
  return Object.entries(TOOLS).map(([name, tool]) => {
    const paramLines = Object.entries(tool.parameters || {}).map(([pName, p]) =>
      `    - ${pName} (${p.type}${p.required ? ', REQUIRED' : ''}): ${p.description || ''}`
    ).join('\n');

    return `### ${name}\n  ${tool.description}\n  Parameters:\n${paramLines}`;
  }).join('\n\n');
}

/**
 * Append a tool call entry to the audit log.
 */
function appendToAuditLog(entry) {
  if (!config.AUDIT_LOG) return;
  try {
    const logDir = path.join(os.homedir(), '.deepseek-agent');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    
    const logPath = path.join(logDir, 'audit.log');
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      workingDir: config.WORKING_DIR,
      ...entry
    }) + '\n';
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (err) {
    // ignore
  }
}

/**
 * Validate tool arguments against the tool's parameter schema.
 */
function validateToolArgs(toolName, tool, args) {
  if (!config.PARAM_VALIDATION) return;
  
  const params = tool.parameters || {};
  for (const [paramName, spec] of Object.entries(params)) {
    const value = args[paramName];
    
    // Check required
    if (spec.required && (value === undefined || value === null)) {
      throw Errors.invalidToolArgs(toolName, paramName, spec.type + ' (REQUIRED)', value);
    }
    
    if (value !== undefined && value !== null) {
      // Check type
      let valid = true;
      if (spec.type === 'string' && typeof value !== 'string') valid = false;
      else if (spec.type === 'number' && typeof value !== 'number') valid = false;
      else if (spec.type === 'boolean' && typeof value !== 'boolean') valid = false;
      else if (spec.type === 'array' && !Array.isArray(value)) valid = false;
      else if (spec.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) valid = false;
      
      if (!valid) {
        throw Errors.invalidToolArgs(toolName, paramName, spec.type, value);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  Execute a tool by name
// ─────────────────────────────────────────────
async function executeTool(name, args) {
  // Fix 13 — Validate tool name against allowlist
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Security: invalid tool name "${name}"`);
  }

  const tool = TOOLS[name];
  if (!tool) {
    const available = Object.keys(TOOLS).join(', ');
    throw new Error(`Unknown tool: "${name}". Available tools: ${available}`);
  }

  // Fix 12 — Validate all tool parameters before execution
  validateToolArgs(name, tool, args);

  // 1. Check Cache
  try {
    if (cache.shouldCache(name)) {
      const cached = cache.get(name, args);
      if (cached !== null) {
        appendToAuditLog({ tool: name, args, status: 'cache_hit', exitCode: 0 });
        return cached;
      }
    }
  } catch (err) {
    if (config.DEBUG) console.warn(`[cache] get error: ${err.message}`);
  }

  // 2. Execute tool
  const start = Date.now();
  let result;
  let exitCode = 0;
  try {
    result = await tool.execute(args);
  } catch (err) {
    exitCode = 1;
    throw err;
  } finally {
    const ms = Date.now() - start;
    appendToAuditLog({ tool: name, args, exitCode, ms });
  }

  // 3. Update Cache & Invalidate
  try {
    if (cache.shouldCache(name)) {
      cache.set(name, args, result);
    }

    const toInvalidate = cache.invalidatesCache(name);
    if (toInvalidate) {
      for (const toolName of toInvalidate) {
        cache.invalidateByTool(toolName);
      }
    }
  } catch (err) {
    if (config.DEBUG) console.warn(`[cache] set/invalidate error: ${err.message}`);
  }

  return result;
}

const loadedPlugins = [];
if (fs.existsSync(config.PLUGIN_DIR)) {
  const { loaded, failed } = loadAllPlugins(config.PLUGIN_DIR, Object.keys(TOOLS));
  
  for (const plugin of loaded) {
    TOOLS[plugin.name] = plugin;
    loadedPlugins.push(plugin.name);
    logger.success(`Loaded custom plugin: ${plugin.name}`);
  }

  for (const fail of failed) {
    logger.warn(`Failed to load plugin ${fail.file}: ${fail.error}`);
  }
}

function getLoadedPluginCount() {
  return loadedPlugins.length;
}

function getLoadedPlugins() {
  return loadedPlugins;
}

module.exports = { TOOLS, executeTool, getToolDescriptions, getLoadedPluginCount, getLoadedPlugins, cache };
