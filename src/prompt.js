// src/prompt.js — System prompt and conversation builder
'use strict';

const os   = require('os');
const path = require('path');
const { getToolDescriptions } = require('./tools');
const config = require('./config');
const { 
  estimateTokenCount, 
  shouldCompress, 
  compressConversation 
} = require('./compressor');

// ─────────────────────────────────────────────
//  System prompt — sent as the first message
// ─────────────────────────────────────────────

function buildSystemPrompt(profileName = 'default', profileAddition = '') {
  const toolDocs = getToolDescriptions();
  const cwd      = config.WORKING_DIR;
  const platform = os.platform() + ' ' + os.release();
  const nodeVer  = process.version;
  const now      = new Date().toISOString();

  // NOTE: We intentionally avoid a single template literal for the full prompt
  // because the tool-call example contains triple backticks which would
  // terminate the template literal early and cause a SyntaxError.
  // We build the string with an array join + a FENCE variable instead.

  const FENCE = '```';

  const lines = [
    'You are Forge Agent — an expert AI software engineer and coding assistant',
    'running inside a terminal-based agent framework. You have direct access to the',
    "user's filesystem and can execute shell commands.",
    '',
    'ENVIRONMENT',
    '───────────',
    'Platform         : ' + platform,
    'Node.js          : ' + nodeVer,
    'Date/Time        : ' + now,
    'Working Directory: ' + cwd,
    '',
    'YOUR CAPABILITIES',
    '─────────────────',
    'You can read/write files, run shell commands, search codebases, fetch URLs,',
    'and scaffold entire projects. You operate in an autonomous loop: you call a',
    'tool, receive its result, and continue until the task is fully complete.',
    '',
    'HOW TO CALL TOOLS',
    '─────────────────',
    'When you need to use a tool, your ENTIRE response must be ONLY a fenced code',
    'block tagged "tool_call" — with NO text before or after it:',
    '',
    FENCE + 'tool_call',
    '{',
    '  "name": "TOOL_NAME_HERE",',
    '  "args": {',
    '    "param1": "value1",',
    '    "param2": "value2"',
    '  }',
    '}',
    FENCE,
    '',
    'CRITICAL RULES:',
    '- Output ONLY the tool_call block — no prose, no greeting, nothing else.',
    '- ONE tool call per response. Never multiple.',
    '- Content must be valid JSON with exactly "name" and "args" keys.',
    '- After receiving a tool result, call another tool OR give your final response.',
    '- Only write plain prose (no code block) when the task is 100% complete.',
    '',
    'WHEN TO STOP',
    '────────────',
    'When fully done, respond with a clear natural language summary.',
    'Do NOT wrap it in any tags or code blocks. Just plain text.',
    '',
    'CODING GUIDELINES (CRITICAL)',
    '────────────────────────────',
    '- **DEFAULT TECH STACK**: Unless the user explicitly requests a framework (like React, Angular) or a language (like Python), ALWAYS default to vanilla web technologies (HTML, CSS, vanilla JavaScript). Prefer zero-install solutions that can run directly in a browser.',
    '- **AVOID TRUNCATION**: You are communicating through an interface with a strict output token limit. If you need to write a large file (e.g., more than 150 lines), DO NOT use `write_file` for the entire file at once because your output will be truncated. Instead, use `write_file` to scaffold the basic structure, and then use multiple `append_to_file` tool calls to build the file in safe chunks.',
    '- Always read existing files before modifying them.',
    '- Always check the directory structure before creating new files.',
    '- Write complete, production-quality code — no TODOs, no placeholders.',
    '- Include proper error handling in all code you write.',
    '- After writing code, run it (if applicable) to verify it works.',
    '- Prefer small focused files over large monolithic ones.',
    '- When installing packages, check package.json first.',
    '',
    'MULTI-STEP APPROACH',
    '───────────────────',
    'For complex tasks, break them into steps:',
    '1. Explore the codebase / understand context',
    '2. Plan what changes need to be made',
    '3. Make changes systematically, chunking large files to bypass output limits',
    '4. Test / verify the result',
    '',
    'AVAILABLE TOOLS',
    '───────────────',
    toolDocs,
    '',
  ];

  if (profileAddition) {
    lines.push('=== PROFILE: ' + profileName + ' ===');
    lines.push(profileAddition);
    lines.push('==========================');
    lines.push('');
  }

  lines.push('Remember: You are running autonomously. Be thorough, be precise, and complete');
  lines.push('the task fully. If something is ambiguous, make a sensible decision and note');
  lines.push('it in your final response.');

  return lines.join('\n');
}

// ─────────────────────────────────────────────
//  Conversation / message history manager
// ─────────────────────────────────────────────

class ConversationManager {
  constructor() {
    this.messages      = [];
    this._systemPrompt = null;
  }

  /**
   * Build the very first user message that includes the system prompt,
   * working-directory context, and the user's task.
   */
  buildFirstMessage(task, workingDirListing, profileName = 'default', profileAddition = '') {
    this._systemPrompt = buildSystemPrompt(profileName, profileAddition);

    const dirContext = workingDirListing
      ? '\nCURRENT WORKING DIRECTORY CONTENTS:\n' + workingDirListing + '\n'
      : '';

    const firstMessage = [
      this._systemPrompt,
      '',
      '═'.repeat(60),
      '',
      dirContext,
      'USER TASK:',
      '──────────',
      task,
    ].join('\n');

    this.messages.push({ role: 'user', content: firstMessage });
    return firstMessage;
  }

  /**
   * Prepend memory context to the first user message.
   */
  prependMemoryContext(memoryText) {
    if (this.messages.length > 0 && this.messages[0].role === 'user') {
        this.messages[0].content = memoryText + '\n\n' + this.messages[0].content;
    }
  }

  /**
   * Add a tool result as a user-turn message (feeding results back to the AI).
   */
  addToolResult(toolName, result, isError) {
    const status  = isError ? 'ERROR' : 'SUCCESS';
    const content = [
      '[TOOL RESULT: ' + toolName + ' | ' + status + ']',
      String(result),
      '[END TOOL RESULT]',
      '',
      'Continue with the next step, or provide your final response if the task is complete.',
    ].join('\n');

    this.messages.push({ role: 'user', content: content });
    return content;
  }

  /**
   * Add an assistant message (the AI's raw response).
   */
  addAssistantMessage(content) {
    this.messages.push({ role: 'assistant', content: content });
  }

  /**
   * Get the most recent user message content.
   */
  getLatestUserMessage() {
    const userMessages = this.messages.filter(function(m) { return m.role === 'user'; });
    return userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
  }

  /**
   * How many assistant turns have happened.
   */
  get turnCount() {
    return this.messages.filter(function(m) { return m.role === 'assistant'; }).length;
  }

  /**
   * Export the full conversation as a readable text log.
   */
  exportLog() {
    return this.messages.map(function(m) {
      const header = m.role === 'user' ? 'USER' : 'ASSISTANT';
      return '\n' + '─'.repeat(40) + '\n' + header + '\n' + '─'.repeat(40) + '\n' + m.content;
    }).join('\n');
  }

  /**
   * Compress conversation history if needed.
   */
  compress(opts = {}) {
    this.messages = compressConversation(this.messages, opts);
  }

  /**
   * Return estimated total token count of all messages.
   */
  estimatedTokens() {
    return this.messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
  }

  /**
   * Returns true if over threshold.
   */
  shouldCompress(threshold) {
    return shouldCompress(this.messages, threshold);
  }
}

module.exports = { buildSystemPrompt, ConversationManager };