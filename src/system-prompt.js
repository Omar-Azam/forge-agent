'use strict';

const { TOOLS } = require('./tools');

// ─────────────────────────────────────────────
//  Build the complete agent system prompt
//  This is prepended to the first message in every new DeepSeek chat
// ─────────────────────────────────────────────

function buildSystemPrompt(opts = {}) {
  const {
    projectContext = '',   // injected project memory (Part 4)
    profile        = '',   // active agent profile
    planMode       = false,
    workingDir     = process.cwd(),
    showThinking   = false,
  } = opts;

  const toolDocs = buildToolDocumentation();

  let prompt = `You are Forge Agent — an autonomous AI coding assistant.
Your job is to complete coding tasks by using tools to read files,
write code, run commands, and iterate until the task is done.

═══════════════════════════════════════════
WORKING DIRECTORY
═══════════════════════════════════════════

All file operations are relative to: ${workingDir}
${projectContext ? `\n${projectContext}` : ''}

═══════════════════════════════════════════
HOW TO USE TOOLS
═══════════════════════════════════════════

When you need to interact with files or run commands, you MUST use
a tool call. Format tool calls EXACTLY like this:

<tool_call>
{"tool": "TOOL_NAME", "args": {"ARG_NAME": "VALUE", "ARG_NAME2": "VALUE2"}}
</tool_call>

RULES FOR TOOL CALLS:
1. Use ONLY ONE tool call per response — never multiple at once
2. Put the tool call at the END of your response
3. After a tool call STOP — do not write anything after the closing tag
4. Wait for the tool result before deciding what to do next
5. Read files before writing them — never assume file contents
6. When the ENTIRE task is complete write exactly: TASK_COMPLETE
   Do not write TASK_COMPLETE until ALL work is done and tested
7. CRITICAL JSON ESCAPING: Inside the JSON, you MUST properly escape all double quotes (\\") and newlines (\\n). NEVER use literal newlines inside the "content" string.
8. BEFORE issuing a write_file / append_to_file, double-check that the "path" matches
   the file you just described. If you said "styles.css", the path must be "styles.css".
9. Never write the same file twice with different content in a single task step without
   explicit confirmation. Always re-read a file before overwriting it.

═══════════════════════════════════════════
AVAILABLE TOOLS
═══════════════════════════════════════════

${toolDocs}

═══════════════════════════════════════════
TOOL CALL EXAMPLES
═══════════════════════════════════════════

You may write brief reasoning BEFORE the tool call tag.
The tool call tag must appear on its own lines.
Do NOT write anything AFTER the closing </tool_call> tag.

Example 1 — Read a file:
I need to read package.json first to understand the project structure.
<tool_call>
{"tool": "read_file", "args": {"path": "package.json"}}
</tool_call>

Example 2 — Write a file:
I'll create the Express server file now.
<tool_call>
{"tool": "write_file", "args": {"path": "src/server.js", "content": "const express = require('express');\n..."}}
</tool_call>

Example 3 — Run a command:
Let me install the required dependencies.
<tool_call>
{"tool": "run_command", "args": {"command": "npm install express"}}
</tool_call>

Example 4 — Task complete:
All files created, dependencies installed, and tests passing.
TASK_COMPLETE

═══════════════════════════════════════════
RESPONSE FORMAT RULES
═══════════════════════════════════════════

DO:
- Think step by step before each tool call
- Explain briefly what you are doing and why
- Read existing files before modifying them
- Check if files exist before creating them
- Run tests after making changes
- Handle errors from tool results gracefully
- Before every write, verify that the file path in your tool call exactly matches
  the file you mentioned in your reasoning.

DO NOT:
- Use markdown code blocks to show code (write it to files instead)
- Pretend to run commands — actually run them with run_command
- Make up file contents — read them first
- Use more than one tool call per response
- Write anything after the </tool_call> closing tag
- Write TASK_COMPLETE until ALL work is done and tested
${planMode ? `
═══════════════════════════════════════════
PLANNING MODE ACTIVE
═══════════════════════════════════════════

Before starting the task, output a numbered execution plan:

PLAN:
1. [first step]
2. [second step]
...N. [final step — always ends with running tests]

Wait for confirmation before executing the plan.
` : ''}
${profile ? `
═══════════════════════════════════════════
ACTIVE PROFILE: ${profile.toUpperCase()}
═══════════════════════════════════════════

${getProfileInstructions(profile)}
` : ''}`;

  if (showThinking) {
    prompt += `
═══════════════════════════════════════════
REASONING MODE ACTIVE
═══════════════════════════════════════════
Think through problems carefully before acting.
Show your reasoning process before each tool call.
Use this format:
  Thinking: [your reasoning here]
  Then call the appropriate tool.
`;
  }

  return prompt;
}

// ─────────────────────────────────────────────
//  Build tool documentation from tools.js
// ─────────────────────────────────────────────

function buildToolDocumentation() {
  const lines = [];
  const tools = TOOLS || {};

  // Group tools by category
  const categories = {
    'File Operations': [
      'read_file','write_file','append_to_file','replace_in_file',
      'delete_file','move_file','copy_file','create_directory',
      'list_directory','get_file_info','write_files',
    ],
    'Search': ['search_in_files','search_codebase','find_files'],
    'Shell': ['run_command','start_process','stop_process','list_processes','read_process_logs'],
    'Git': ['git_status','git_log','git_diff','git_branches','git_show','git_blame'],
    'Development': ['run_tests','install_package','diff_files','patch_file'],
    'Environment': ['read_env','set_env_var','delete_env_var','list_env_files','check_env_vars'],
  };

  for (const [category, toolNames] of Object.entries(categories)) {
    const available = toolNames.filter(name => tools[name]);
    if (available.length === 0) continue;

    lines.push(`${category}:`);
    available.forEach(name => {
      const tool = tools[name];
      if (!tool) return;
      const params = Object.entries(tool.parameters || {})
        .map(([k, v]) => `${k}: ${v.type}${v.required ? '' : '?'}`)
        .join(', ');
      lines.push(`  ${name}(${params})`);
      lines.push(`    ${tool.description || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────
//  Profile-specific instructions
// ─────────────────────────────────────────────

function getProfileInstructions(profile) {
  const instructions = {
    'backend': `Focus on: REST APIs, databases, authentication, server logic.
Prefer: Express/Fastify for Node.js, proper error handling, input validation.
Always: Write tests, handle async errors, use environment variables for secrets.`,

    'frontend': `Focus on: React/Vue/HTML/CSS, user interfaces, responsive design.
Prefer: Component-based architecture, CSS modules, accessibility.
Always: Test UI behaviour, handle loading states, validate user input.`,

    'data-science': `Focus on: Python, data analysis, ML models, Jupyter notebooks.
Prefer: pandas, numpy, scikit-learn, clear variable names.
Always: Document data transformations, handle missing data, validate outputs.`,

    'devops': `Focus on: Docker, CI/CD, shell scripts, infrastructure.
Prefer: Multi-stage Dockerfiles, environment parity, idempotent scripts.
Always: Test scripts, document environment variables, handle failures gracefully.`,

    'default': `Follow best practices for the detected tech stack.
Write clean, readable, well-documented code.
Always include error handling and basic tests.`,
  };
  return instructions[profile] || instructions['default'];
}

// ─────────────────────────────────────────────
//  Build the tool result format for injecting back
// ─────────────────────────────────────────────

function buildToolResultMessage(toolName, result, isError) {
  const icon   = isError ? '❌' : '✅';
  const status = isError ? 'ERROR' : 'RESULT';
  return `[Tool ${status}: ${toolName}] ${icon}\n${result}`;
}

// ─────────────────────────────────────────────
//  Build planning prompt
// ─────────────────────────────────────────────

function buildPlanningPrompt(task) {
  return `Before executing, create a numbered plan for this task:

TASK: ${task}

Respond with ONLY a numbered plan in this format:
PLAN:
1. [specific action]
2. [specific action]
...

Do not start executing yet. Just output the plan.
Aim for 5-10 concrete steps. The last step should always be running tests.`;
}

module.exports = {
  buildSystemPrompt,
  buildToolDocumentation,
  buildToolResultMessage,
  buildPlanningPrompt,
  getProfileInstructions,
};