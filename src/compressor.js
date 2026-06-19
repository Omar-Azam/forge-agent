// src/compressor.js — Context compression utility
'use strict';

/**
 * Estimate token count of a string (rough estimate: chars / 4).
 */
function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Extract summary facts from a range of messages.
 * Finds files written, commands run, tool names, and errors.
 */
function extractSummaryFacts(messages) {
  const facts = {
    filesWritten: new Set(),
    commandsRun: new Set(),
    toolsUsed: new Set(),
    errors: [],
  };

  for (const msg of messages) {
    const content = msg.content || '';

    // Extract tool name from result headers or tool calls
    const toolMatch = content.match(/\[TOOL RESULT: ([\w_]+) \|/);
    if (toolMatch) facts.toolsUsed.add(toolMatch[1]);

    const toolCallMatch = content.match(/```tool_call\s*\{\s*"name":\s*"([\w_]+)"/);
    if (toolCallMatch) facts.toolsUsed.add(toolCallMatch[1]);

    // Extract files written
    if (content.includes('write_file')) {
      const fileMatch = content.match(/"path":\s*"([^"]+)"/);
      if (fileMatch) facts.filesWritten.add(fileMatch[1]);
    }
    const writeResultMatch = content.match(/✓ Wrote .* → ([^\s\n]+)/);
    if (writeResultMatch) facts.filesWritten.add(writeResultMatch[1]);

    // Extract commands run
    const commandMatch = content.match(/"command":\s*"([^"]+)"/);
    if (commandMatch) facts.commandsRun.add(commandMatch[1]);

    // Extract errors
    if (content.includes('| ERROR]')) {
      const errorLines = content.split('\n').filter(l => l.includes('Error:') || l.includes('Reason:'));
      if (errorLines.length > 0) facts.errors.push(errorLines[0].trim());
    }
  }

  return {
    filesWritten: Array.from(facts.filesWritten),
    commandsRun: Array.from(facts.commandsRun),
    toolsUsed: Array.from(facts.toolsUsed),
    errors: facts.errors.slice(-3), // Keep last 3 errors
  };
}

/**
 * Build a summary message from extracted facts.
 */
function buildSummaryMessage(facts, compressedCount) {
  const lines = [
    `[CONTEXT SUMMARY — ${compressedCount} earlier steps compressed]`,
  ];

  if (facts.toolsUsed.length > 0) {
    lines.push(`Tools used: ${facts.toolsUsed.join(', ')}`);
  }

  if (facts.filesWritten.length > 0) {
    lines.push(`Files modified: ${facts.filesWritten.join(', ')}`);
  }

  if (facts.commandsRun.length > 0) {
    lines.push(`Commands run: ${facts.commandsRun.join(', ')}`);
  }

  if (facts.errors.length > 0) {
    lines.push(`Recent issues: ${facts.errors.join('; ')}`);
  }

  lines.push('\n(Context compressed to save space. Full history of the above actions was processed.)');

  return lines.join('\n');
}

/**
 * Check if the conversation should be compressed.
 */
function shouldCompress(messages, threshold) {
  const totalTokens = messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
  return totalTokens > threshold;
}

/**
 * Compress conversation history.
 * Keeps system prompt and last N messages. Summarizes the rest.
 */
function compressConversation(messages, opts = {}) {
  try {
    const keepRecent = opts.keepRecent || 6;
    
    // Don't compress if too short
    if (messages.length < keepRecent + 2) {
      return messages;
    }

    const firstMsg = messages[0];
    const middleMessages = messages.slice(1, -keepRecent);
    const recentMessages = messages.slice(-keepRecent);

    const facts = extractSummaryFacts(middleMessages);
    const summaryText = buildSummaryMessage(facts, middleMessages.length);

    const summaryMsg = {
      role: 'user',
      content: summaryText,
      compressed: true,
    };

    return [firstMsg, summaryMsg, ...recentMessages];
  } catch (err) {
    // Never throw, return original on error
    return messages;
  }
}

module.exports = {
  estimateTokenCount,
  extractSummaryFacts,
  buildSummaryMessage,
  shouldCompress,
  compressConversation,
};
