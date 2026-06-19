// src/planner.js — Task planning module
'use strict';

/**
 * Build the prompt asking the AI to generate a numbered plan.
 */
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

/**
 * Parse the AI's plan response into a structured object.
 */
function parsePlan(text) {
  if (!text) return { steps: [], raw: '' };

  const steps = [];
  const lines = text.split('\n');

  // Look for lines starting with a number followed by a dot
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (match) {
      steps.push(match[2].trim());
    }
  }

  return {
    steps,
    raw: text
  };
}

/**
 * Format the plan for terminal display.
 */
function formatPlanDisplay(plan) {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return '  (No valid steps found in plan)';
  }

  const lines = plan.steps.map((step, i) => `  \x1b[36m${i + 1}.\x1b[0m ${step}`);
  return [
    '\x1b[1m\x1b[35mProposed Execution Plan:\x1b[0m',
    ...lines,
    ''
  ].join('\n');
}

/**
 * Legacy compatibility
 */
function buildPlanPrompt(task) { return buildPlanningPrompt(task); }
function formatPlanForDisplay(steps) { return formatPlanDisplay({ steps }); }
function formatPlanForContext(steps) {
  if (!steps || steps.length === 0) return '';
  const list = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Your established plan:\n${list}\n\nPlease proceed with Step 1.`;
}
function isPlanResponse(text) {
  if (!text) return false;
  return text.includes('PLAN:') || /^\s*1\.\s+/.test(text);
}

module.exports = {
  buildPlanningPrompt,
  parsePlan,
  formatPlanDisplay,
  // Legacy exports
  buildPlanPrompt,
  formatPlanForDisplay,
  formatPlanForContext,
  isPlanResponse
};