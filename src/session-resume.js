// src/session-resume.js — Helper module for session resumption logic
'use strict';

const readline = require('readline');
const logger = require('./logger');

/**
 * Build a formatted context string for the AI to understand a resumed session
 */
function buildResumeContext(entry) {
  if (!entry) return '';
  
  const filesWritten = (entry.filesWritten && entry.filesWritten.length > 0)
    ? entry.filesWritten.join(', ')
    : 'None';
    
  const commandsRun = (entry.commandsRun && entry.commandsRun.length > 0)
    ? entry.commandsRun.join('\n- ')
    : 'None';

  return [
    '=== RESUMING PREVIOUS SESSION ===',
    `Original task: ${entry.task || '(unknown task)'}`,
    'Previously completed:',
    `- Files written: ${filesWritten}`,
    `- Commands run: ${commandsRun}`,
    `- Steps taken: ${entry.stepsCount || 0}`,
    `- Status when stopped: ${entry.status || 'unknown'}`,
    '',
    'Please continue this task from where it left off.',
    'The files listed above have already been created/modified.',
    'Focus on what still needs to be done.',
    '================================'
  ].join('\n');
}

/**
 * Print resume information to the terminal
 */
function printResumeHeader(entry, loggerInstance = logger) {
  if (!entry) return;
  
  loggerInstance.info('📋 Resuming context from previous session...');
  loggerInstance.dim(`   Original task: ${entry.task}`);
  if (entry.filesWritten && entry.filesWritten.length > 0) {
    loggerInstance.dim(`   Files written: ${entry.filesWritten.join(', ')}`);
  }
  loggerInstance.dim(`   Steps completed: ${entry.stepsCount || 0}`);
  loggerInstance.dim(`   Status when stopped: ${entry.status || 'unknown'}`);
}

/**
 * Interactive terminal selection from history entries
 */
async function selectFromHistory(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    rl.close();
    process.exit(0);
  });

  return new Promise((resolve) => {
    const prompt = '\nEnter number to select (or q to cancel): ';
    
    const ask = () => {
      rl.question(prompt, (answer) => {
        const choice = answer.trim().toLowerCase();
        
        if (choice === 'q') {
          rl.close();
          resolve(null);
          return;
        }

        const num = parseInt(choice);
        if (!isNaN(num) && num >= 1 && num <= entries.length) {
          rl.close();
          resolve(entries[num - 1]);
        } else {
          process.stdout.write('Invalid selection. Please try again.\n');
          ask();
        }
      });
    };

    ask();
  });
}

/**
 * Ask what to do with a selected history entry
 */
async function promptResumeAction(entry) {
  if (!entry) return { action: 'cancel' };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    rl.close();
    process.exit(0);
  });

  console.log(`\nSelected: "${entry.task.slice(0, 80)}${entry.task.length > 80 ? '...' : ''}"`);
  console.log(' [1] Re-run this exact task');
  console.log(' [2] Continue from where it stopped');
  console.log(' [3] Run a modified version (you will type changes)');
  console.log(' [4] Cancel');

  return new Promise((resolve) => {
    const ask = () => {
      rl.question('\nEnter choice: ', (answer) => {
        const choice = answer.trim();

        if (choice === '1') {
          rl.close();
          resolve({ action: 'rerun', task: entry.task });
        } else if (choice === '2') {
          rl.close();
          resolve({ action: 'continue', task: entry.task, context: buildResumeContext(entry) });
        } else if (choice === '3') {
          rl.question('\nDescribe your changes: ', (changes) => {
            rl.close();
            const combinedTask = `${entry.task}\n\nAdditional instructions: ${changes}`;
            resolve({ action: 'modify', task: combinedTask });
          });
        } else if (choice === '4' || choice.toLowerCase() === 'q') {
          rl.close();
          resolve({ action: 'cancel' });
        } else {
          process.stdout.write('Invalid choice. Please enter 1, 2, 3, or 4.\n');
          ask();
        }
      });
    };

    ask();
  });
}

module.exports = {
  buildResumeContext,
  printResumeHeader,
  selectFromHistory,
  promptResumeAction
};
