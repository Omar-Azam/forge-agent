// src/completions.js — Shell completion generator for Forge Agent
'use strict';

const ALL_FLAGS = [
  { flag: '--interactive',      short: '-i',  description: 'Multiple tasks with shared AI context',    takesValue: false },
  { flag: '--dir',              short: '-d',  description: 'Set working directory',                    takesValue: true,  valueHint: 'DIR' },
  { flag: '--model',            short: '-m',  description: 'AI model to use',                          takesValue: true,  valueHint: 'MODEL', values: ['deepseek', 'chatgpt', 'gemini'] },
  { flag: '--profile',          short: null,  description: 'Agent profile',                            takesValue: true,  valueHint: 'PROFILE', values: ['default', 'backend', 'frontend', 'data-science', 'devops'] },
  { flag: '--plan',             short: null,  description: 'Show plan before executing',               takesValue: false },
  { flag: '--think',            short: null,  description: 'Show R1 reasoning blocks',                 takesValue: false },
  { flag: '--no-memory',        short: null,  description: 'Skip memory for this run',                 takesValue: false },
  { flag: '--no-cache',         short: null,  description: 'Disable tool result caching',              takesValue: false },
  { flag: '--no-tui',           short: null,  description: 'Use plain text output',                    takesValue: false },
  { flag: '--compact',          short: null,  description: 'Compact TUI output mode',                  takesValue: false },
  { flag: '--watch',            short: null,  description: 'Watch files for changes',                  takesValue: false },
  { flag: '--watch-pattern',    short: null,  description: 'File pattern to watch',                    takesValue: true,  valueHint: 'PATTERN' },
  { flag: '--watch-debounce',   short: null,  description: 'Debounce delay in ms',                     takesValue: true,  valueHint: 'MS' },
  { flag: '--watch-max',        short: null,  description: 'Max watch runs',                           takesValue: true,  valueHint: 'N' },
  { flag: '--watch-cooldown',   short: null,  description: 'Min ms between watch runs',                takesValue: true,  valueHint: 'MS' },
  { flag: '--format',           short: null,  description: 'Output format',                            takesValue: true,  valueHint: 'FORMAT', values: ['text', 'markdown', 'json', 'json-raw', 'minimal', 'silent'] },
  { flag: '--output',           short: null,  description: 'Write output to file',                     takesValue: true,  valueHint: 'FILE' },
  { flag: '--timestamp',        short: null,  description: 'Include timestamp in json output',         takesValue: false },
  { flag: '--template',         short: null,  description: 'Run a named task template',                takesValue: true,  valueHint: 'TEMPLATE' },
  { flag: '--list-templates',   short: null,  description: 'List all available templates',             takesValue: false },
  { flag: '--save-template',    short: null,  description: 'Save task as custom template',             takesValue: true,  valueHint: 'NAME' },
  { flag: '--remove-template',  short: null,  description: 'Remove a custom template',                 takesValue: true,  valueHint: 'NAME' },
  { flag: '--show-template',    short: null,  description: 'Show full template details',               takesValue: true,  valueHint: 'NAME' },
  { flag: '--template-search',  short: null,  description: 'Search templates by keyword',              takesValue: true,  valueHint: 'QUERY' },
  { flag: '--history',          short: null,  description: 'Show task history',                        takesValue: false },
  { flag: '--history-stats',    short: null,  description: 'Show history statistics',                  takesValue: false },
  { flag: '--history-clear',    short: null,  description: 'Clear task history',                       takesValue: false },
  { flag: '--history-search',   short: null,  description: 'Search history by term',                   takesValue: true,  valueHint: 'TERM' },
  { flag: '--list-plugins',     short: null,  description: 'List all loaded plugins',                  takesValue: false },
  { flag: '--new-plugin',       short: null,  description: 'Create a plugin stub',                     takesValue: true,  valueHint: 'NAME' },
  { flag: '--list-profiles',    short: null,  description: 'List all profiles',                        takesValue: false },
  { flag: '--setup',            short: null,  description: 'Run configuration wizard',                 takesValue: false },
  { flag: '--config',           short: null,  description: 'Alias for --setup',                        takesValue: false },
  { flag: '--config-path',      short: null,  description: 'Show config file path',                    takesValue: false },
  { flag: '--debug',            short: null,  description: 'Verbose debug output',                     takesValue: false },
  { flag: '--headless',         short: null,  description: 'Run browser invisibly',                    takesValue: false },
  { flag: '--save-log',         short: null,  description: 'Save conversation to disk',                takesValue: false },
  { flag: '--calibrate',        short: null,  description: 'Auto-detect browser selectors',            takesValue: false },
  { flag: '--strict-sandbox',   short: null,  description: 'Block access outside working directory',    takesValue: false },
  { flag: '--audit-log',        short: null,  description: 'Enable tool call audit logging',           takesValue: false },
  { flag: '--version',          short: '-v',  description: 'Show version',                             takesValue: false },
  { flag: '--help',             short: '-h',  description: 'Show help',                                takesValue: false },
];

function generateBashCompletion() {
  const flags = ALL_FLAGS.map(f => f.flag + (f.short ? ' ' + f.short : '')).join(' ');
  const templates = Object.keys(require('./templates').BUILT_IN_TEMPLATES).join(' ');

  return `
_forge_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --model)     COMPREPLY=( $(compgen -W "deepseek chatgpt gemini" -- "$cur") ); return 0 ;;
    --profile)   COMPREPLY=( $(compgen -W "default backend frontend data-science devops" -- "$cur") ); return 0 ;;
    --format)    COMPREPLY=( $(compgen -W "text markdown json json-raw minimal silent" -- "$cur") ); return 0 ;;
    --template)  COMPREPLY=( $(compgen -W "${templates}" -- "$cur") ); return 0 ;;
    --dir|--output|--watch-pattern) COMPREPLY=( $(compgen -f -- "$cur") ); return 0 ;;
  esac

  opts="${flags}"
  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
}
complete -F _forge_completions forge-agent
complete -F _forge_completions fa
`;
}

function generateZshCompletion() {
  const templates = Object.keys(require('./templates').BUILT_IN_TEMPLATES).join(' ');
  
  const args = ALL_FLAGS.map(f => {
    let arg = f.short ? `'(-${f.short.slice(1)} ${f.flag})'` : '';
    arg += f.short ? `{${f.short},${f.flag}}` : `'${f.flag}'`;
    arg += `'[${f.description}]'`;
    if (f.takesValue) {
      if (f.values) arg += `:${f.valueHint}:(${f.values.join(' ')})`;
      else if (f.valueHint === 'FILE' || f.valueHint === 'DIR') arg += `:${f.valueHint}:_files`;
      else arg += `:${f.valueHint}`;
    }
    return arg;
  }).join(' \\\n         ');

  return `
#compdef forge-agent fa

_forge() {
  _arguments \\
         ${args} \\
         '*:task:'
}
_forge "$@"
`;
}

function generateFishCompletion() {
  const templates = Object.keys(require('./templates').BUILT_IN_TEMPLATES).join(' ');
  
  let completions = '';
  
  const gen = (cmd) => {
    let script = '';
    for (const f of ALL_FLAGS) {
      script += `complete -c ${cmd} `;
      if (f.short) script += `-s ${f.short.slice(1)} `;
      script += `-l ${f.flag.slice(2)} -d '${f.description}' `;
      if (f.takesValue) {
        script += '-r ';
        if (f.values) script += `-a '${f.values.join(' ')}' `;
      }
      script += '\n';
    }
    return script;
  };

  completions += gen('forge-agent');
  completions += gen('fa');
  
  return completions;
}

function getInstallInstructions(shell) {
  switch (shell) {
    case 'bash':
      return `
# Add to ~/.bashrc or ~/.bash_profile:
source <(forge-agent --completion-bash)

# Or install system-wide:
forge-agent --completion-bash > /etc/bash_completion.d/forge-agent
# Then reload: source ~/.bashrc
`;
    case 'zsh':
      return `
# Add to ~/.zshrc:
source <(forge-agent --completion-zsh)

# Or install to a completions directory:
forge-agent --completion-zsh > ~/.zsh/completions/_forge-agent
# Then reload: source ~/.zshrc
`;
    case 'fish':
      return `
# Install directly:
forge-agent --completion-fish > ~/.config/fish/completions/forge-agent.fish
# Completions load automatically on next Fish start.
`;
    default:
      return 'Unknown shell. Please specify bash, zsh, or fish.';
  }
}

module.exports = {
  ALL_FLAGS,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  getInstallInstructions
};
