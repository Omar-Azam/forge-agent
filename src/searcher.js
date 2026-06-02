// src/searcher.js — Multi-file semantic codebase search engine
//
// Goes beyond simple grep by:
//  - Extracting code symbols (functions, classes, exports, imports)
//  - Ranking results by relevance score
//  - Grouping related matches across files
//  - Understanding partial/fuzzy name matches
//  - Returning structured, AI-readable output
//
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', 'build',
  'coverage', '.nyc_output', '__pycache__', '.pytest_cache',
  'vendor', 'target', '.gradle', '.mvn', 'out',
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.mp4', '.mp3', '.wav', '.avi', '.mov',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pyc', '.class', '.o', '.a',
  '.lock',
]);

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.php', '.lua', '.r', '.dart', '.scala',
  '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.md', '.txt', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.proto',
  '.vue', '.svelte', '.astro',
]);

// ─────────────────────────────────────────────
//  Symbol extraction — language-aware patterns
// ─────────────────────────────────────────────

const SYMBOL_PATTERNS = [
  // JavaScript / TypeScript
  { lang: 'js/ts', re: /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,         kind: 'function'  },
  { lang: 'js/ts', re: /(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,   kind: 'function'  },
  { lang: 'js/ts', re: /(?:^|\n)\s*(?:export\s+)?class\s+(\w+)/g,                          kind: 'class'     },
  { lang: 'js/ts', re: /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/g,              kind: 'variable'  },
  { lang: 'js/ts', re: /require\(['"]([^'"]+)['"]\)/g,                                      kind: 'import'    },
  { lang: 'js/ts', re: /from\s+['"]([^'"]+)['"]/g,                                          kind: 'import'    },
  { lang: 'js/ts', re: /module\.exports\s*=\s*\{([^}]+)\}/g,                               kind: 'export'    },

  // Python
  { lang: 'py', re: /(?:^|\n)\s*def\s+(\w+)\s*\(/g,    kind: 'function' },
  { lang: 'py', re: /(?:^|\n)\s*class\s+(\w+)[\s:(]/g, kind: 'class'    },
  { lang: 'py', re: /^import\s+(\S+)/gm,                kind: 'import'   },
  { lang: 'py', re: /^from\s+(\S+)\s+import/gm,         kind: 'import'   },

  // Go
  { lang: 'go', re: /(?:^|\n)\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g, kind: 'function' },
  { lang: 'go', re: /(?:^|\n)\s*type\s+(\w+)\s+struct/g,                       kind: 'class'    },

  // Java / Kotlin / C#
  { lang: 'jvm', re: /(?:^|\n)\s*(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*\{/g, kind: 'function' },
  { lang: 'jvm', re: /(?:^|\n)\s*(?:public|private)?\s*class\s+(\w+)/g, kind: 'class' },

  // Rust
  { lang: 'rs', re: /(?:^|\n)\s*(?:pub\s+)?fn\s+(\w+)\s*[\(<]/g,    kind: 'function' },
  { lang: 'rs', re: /(?:^|\n)\s*(?:pub\s+)?struct\s+(\w+)/g,         kind: 'class'    },
  { lang: 'rs', re: /(?:^|\n)\s*(?:pub\s+)?enum\s+(\w+)/g,           kind: 'class'    },
];

/**
 * Extract all named symbols from source code content.
 * Returns array of { name, kind, line }
 */
function extractSymbols(content, filePath) {
  const ext     = path.extname(filePath).toLowerCase();
  const symbols = [];
  const lines   = content.split('\n');

  // Build a line-number index for fast lookup
  const lineIndex = [];
  let   pos       = 0;
  for (const line of lines) {
    lineIndex.push(pos);
    pos += line.length + 1;
  }

  function posToLine(charPos) {
    let lo = 0, hi = lineIndex.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineIndex[mid] <= charPos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  for (const { re, kind } of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!name || name.length < 2) continue;
      if (['if', 'for', 'while', 'do', 'try', 'new', 'return', 'const', 'let', 'var'].includes(name)) continue;
      // If the match starts with \n, skip past it so we land on the correct line
      const charPos = content[m.index] === '\n' ? m.index + 1 : m.index;
      symbols.push({ name, kind, line: posToLine(charPos) });
    }
  }

  // Deduplicate by name+kind
  const seen = new Set();
  return symbols.filter(s => {
    const key = `${s.name}:${s.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────
//  Relevance scoring
// ─────────────────────────────────────────────

/**
 * Score how relevant a file+match is to the query.
 * Higher = more relevant.
 */
function scoreMatch(query, fileName, content, matchLine, symbols) {
  let score = 0;
  const qLower  = query.toLowerCase();
  const fLower  = fileName.toLowerCase();
  const mLower  = matchLine.toLowerCase();
  const qWords  = qLower.split(/\s+/).filter(w => w.length > 1);

  // Exact match in line → high base score
  if (mLower.includes(qLower)) score += 40;

  // Query words in line
  for (const word of qWords) {
    if (mLower.includes(word)) score += 10;
  }

  // Query in filename
  if (fLower.includes(qLower)) score += 30;
  for (const word of qWords) {
    if (fLower.includes(word)) score += 8;
  }

  // Query matches a symbol name
  for (const sym of symbols) {
    const sLower = sym.name.toLowerCase();
    if (sLower === qLower)           score += 50; // exact symbol match
    else if (sLower.includes(qLower)) score += 20; // partial symbol match
    else {
      for (const word of qWords) {
        if (sLower.includes(word))   score += 10;
      }
    }
  }

  // Prefer code files over config/docs
  const ext = path.extname(fileName).toLowerCase();
  if (['.js', '.ts', '.py', '.go', '.rs', '.java'].includes(ext)) score += 5;
  if (['.md', '.txt', '.yaml', '.json'].includes(ext))             score -= 2;

  return score;
}

// ─────────────────────────────────────────────
//  Fuzzy name matching
// ─────────────────────────────────────────────

/**
 * Returns true if `query` fuzzy-matches `target`.
 * Supports:
 *   - Exact substring: "getUserById" matches "getUser"
 *   - camelCase decomposition: "gub" matches "getUserById"
 *   - Underscore decomposition: "g_u" matches "get_user"
 */
function fuzzyMatch(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.includes(q)) return true;

  // camelCase / snake_case decomposition
  const words = t
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/);

  // Acronym match: first letters of words
  const acronym = words.map(w => w[0]).join('');
  if (acronym.includes(q)) return true;

  // All query chars appear in order in target (subsequence)
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length && q.length >= 3) return true;

  return false;
}

// ─────────────────────────────────────────────
//  File walker
// ─────────────────────────────────────────────

function walkFiles(dir, maxFiles = 500) {
  const results = [];

  function walk(current, depth) {
    if (depth > 8 || results.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }

    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (!BINARY_EXTS.has(ext)) {
          results.push(full);
        }
      }
    }
  }

  walk(dir, 0);
  return results;
}

// ─────────────────────────────────────────────
//  Main search function
// ─────────────────────────────────────────────

/**
 * Search a codebase for a query string/symbol.
 *
 * @param {string} query          - What to search for
 * @param {string} directory      - Root directory to search
 * @param {Object} options
 * @param {string} options.type   - 'text' | 'symbol' | 'file' | 'auto'
 * @param {string} options.ext    - Limit to files with this extension (e.g. '.js')
 * @param {number} options.limit  - Max results to return (default: 20)
 * @param {boolean} options.fuzzy - Use fuzzy matching (default: true)
 * @returns {SearchResult}
 */
function searchCodebase(query, directory, options = {}) {
  const {
    type  = 'auto',
    ext   = null,
    limit = 20,
    fuzzy = true,
  } = options;

  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const files   = walkFiles(directory);
  const matches = [];

  // Filter by extension if specified
  const filteredFiles = ext
    ? files.filter(f => path.extname(f).toLowerCase() === ext.toLowerCase())
    : files;

  for (const filePath of filteredFiles) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { continue; }

    // Skip if file is too large (> 500KB)
    if (content.length > 512_000) continue;

    const symbols   = extractSymbols(content, filePath);
    const lines     = content.split('\n');
    const relPath   = path.relative(directory, filePath);
    const fileScore = scoreMatch(query, relPath, content, '', symbols);

    // ── Symbol search ────────────────────────────────────────────────────
    if (type === 'symbol' || type === 'auto') {
      for (const sym of symbols) {
        const matches_ = fuzzy
          ? fuzzyMatch(query, sym.name)
          : sym.name.toLowerCase().includes(query.toLowerCase());

        if (matches_) {
          const line    = lines[sym.line - 1] || '';
          const context = lines.slice(
            Math.max(0, sym.line - 1),
            Math.min(lines.length, sym.line + 3)
          ).map((l, i) => `${sym.line + i}: ${l}`).join('\n');

          matches.push({
            file    : relPath,
            line    : sym.line,
            kind    : 'symbol',
            symKind : sym.kind,
            name    : sym.name,
            preview : line.trim().slice(0, 120),
            context,
            score   : fileScore + 50 + (sym.name.toLowerCase() === query.toLowerCase() ? 30 : 0),
          });
        }
      }
    }

    // ── Text search ──────────────────────────────────────────────────────
    if (type === 'text' || type === 'auto') {
      const qRe = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'gi'
      );

      lines.forEach((line, idx) => {
        if (!qRe.test(line)) return;
        qRe.lastIndex = 0;

        const lineNum = idx + 1;
        const ctx     = lines.slice(
          Math.max(0, idx - 1),
          Math.min(lines.length, idx + 3)
        ).map((l, i) => `${Math.max(1, idx) + i}: ${l}`).join('\n');

        matches.push({
          file    : relPath,
          line    : lineNum,
          kind    : 'text',
          preview : line.trim().slice(0, 120),
          context : ctx,
          score   : scoreMatch(query, relPath, content, line, symbols),
        });
      });
    }

    // ── File name search ────────────────────────────────────────────────
    if (type === 'file' || type === 'auto') {
      const fileName = path.basename(filePath, path.extname(filePath));
      if (fuzzy ? fuzzyMatch(query, fileName) : fileName.toLowerCase().includes(query.toLowerCase())) {
        matches.push({
          file    : relPath,
          line    : 1,
          kind    : 'file',
          preview : `File: ${relPath} (${lines.length} lines)`,
          context : lines.slice(0, 5).map((l, i) => `${i + 1}: ${l}`).join('\n'),
          score   : fileScore + 40,
        });
      }
    }
  }

  // Sort by score descending, deduplicate file+line
  const seen    = new Set();
  const sorted  = matches
    .sort((a, b) => b.score - a.score)
    .filter(m => {
      const key = `${m.file}:${m.line}:${m.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);

  return {
    query,
    directory,
    totalMatches : matches.length,
    results      : sorted,
    filesSearched: filteredFiles.length,
  };
}

// ─────────────────────────────────────────────
//  Format result for AI consumption
// ─────────────────────────────────────────────

function formatSearchResult(result) {
  if (result.results.length === 0) {
    return [
      `No results found for: "${result.query}"`,
      `Searched ${result.filesSearched} files in ${result.directory}`,
      '',
      'Suggestions:',
      '  - Try a shorter or different query',
      '  - Use type: "text" for exact text search',
      '  - Use type: "symbol" to search only function/class names',
    ].join('\n');
  }

  const lines = [
    `Found ${result.totalMatches} match(es) for "${result.query}" — showing top ${result.results.length}`,
    `Searched ${result.filesSearched} files in ${result.directory}`,
    '',
  ];

  // Group by file for readability
  const byFile = new Map();
  for (const r of result.results) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`── ${file} ──`);
    for (const m of fileMatches) {
      if (m.kind === 'symbol') {
        lines.push(`  [${m.symKind}] ${m.name}  (line ${m.line})`);
        lines.push(`  ${m.preview}`);
      } else if (m.kind === 'file') {
        lines.push(`  [file match] ${m.preview}`);
      } else {
        lines.push(`  line ${m.line}: ${m.preview}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

module.exports = {
  searchCodebase,
  formatSearchResult,
  extractSymbols,
  fuzzyMatch,
  scoreMatch,
  walkFiles,
};
