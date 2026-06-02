// tests/process-manager.test.js — Day 17: Process manager tests
'use strict';

jest.mock('../src/logger', () => ({
  info: jest.fn(), success: jest.fn(), warn: jest.fn(),
  error: jest.fn(), dim: jest.fn(), separator: jest.fn(),
}));

const {
  startProcess,
  stopProcess,
  getProcessStatus,
  listProcesses,
  getProcessLogs,
  waitForReady,
  formatProcessList,
  formatProcessLogs,
  REGISTRY,
  statusIcon,
} = require('../src/process-manager');

// ─────────────────────────────────────────────
//  Clean registry between tests
// ─────────────────────────────────────────────

afterEach(async () => {
  // Stop and remove all processes after each test
  for (const [name, entry] of REGISTRY.entries()) {
    if (entry.process) {
      try { entry.process.kill('SIGKILL'); } catch {}
    }
  }
  REGISTRY.clear();
  // Small delay to let processes die
  await new Promise(r => setTimeout(r, 50));
});

// ─────────────────────────────────────────────
//  statusIcon
// ─────────────────────────────────────────────

describe('statusIcon', () => {
  test('running = green circle', ()  => expect(statusIcon('running')).toBe('🟢'));
  test('stopped = black circle', ()  => expect(statusIcon('stopped')).toBe('⚫'));
  test('crashed = red circle', ()    => expect(statusIcon('crashed')).toBe('🔴'));
  test('starting = yellow circle', () => expect(statusIcon('starting')).toBe('🟡'));
  test('unknown = question mark', () => expect(statusIcon('unknown')).toBe('❓'));
});

// ─────────────────────────────────────────────
//  startProcess
// ─────────────────────────────────────────────

describe('startProcess', () => {
  test('starts a process and returns pid', async () => {
    const result = startProcess('test-proc', 'node -e "setInterval(()=>{},1000)"');
    expect(result.started).toBe(true);
    expect(result.name).toBe('test-proc');
    expect(typeof result.pid).toBe('number');
    expect(result.pid).toBeGreaterThan(0);
  });

  test('process is registered', () => {
    startProcess('reg-test', 'node -e "setInterval(()=>{},1000)"');
    expect(REGISTRY.has('reg-test')).toBe(true);
  });

  test('status is running after start', async () => {
    startProcess('status-test', 'node -e "setInterval(()=>{},1000)"');
    await new Promise(r => setTimeout(r, 100));
    expect(REGISTRY.get('status-test').status).toBe('running');
  });

  test('returns already running message if name taken', () => {
    startProcess('dup-test', 'node -e "setInterval(()=>{},1000)"');
    const result = startProcess('dup-test', 'node -e "setInterval(()=>{},1000)"');
    expect(result.started).toBe(false);
    expect(result.message).toMatch(/already running/i);
  });

  test('replaces process when replace:true', async () => {
    startProcess('replace-test', 'node -e "setInterval(()=>{},1000)"');
    const oldPid = REGISTRY.get('replace-test').pid;
    await new Promise(r => setTimeout(r, 50));
    const result = startProcess('replace-test', 'node -e "setInterval(()=>{},1000)"', { replace: true });
    expect(result.started).toBe(true);
  });

  test('throws on invalid process name', () => {
    expect(() => startProcess('invalid name!', 'echo hi'))
      .toThrow(/invalid process name/i);
  });

  test('captures stdout output', async () => {
    startProcess('output-test', 'node -e "console.log(\'hello from process\')"');
    await new Promise(r => setTimeout(r, 300));
    const logs = getProcessLogs('output-test', 50);
    expect(logs).toBeDefined();
    expect(logs.some(l => l.includes('hello from process'))).toBe(true);
  });

  test('captures stderr output', async () => {
    startProcess('stderr-test', 'node -e "process.stderr.write(\'error output\\n\')"');
    await new Promise(r => setTimeout(r, 300));
    const logs = getProcessLogs('stderr-test', 50);
    expect(logs.some(l => l.includes('error output'))).toBe(true);
  });

  test('process status becomes stopped after exit', async () => {
    startProcess('exit-test', 'node -e "process.exit(0)"');
    await new Promise(r => setTimeout(r, 500));
    const status = getProcessStatus('exit-test');
    expect(['stopped', 'crashed']).toContain(status.status);
  });

  test('crashed process has crashed status', async () => {
    startProcess('crash-test', 'node -e "process.exit(1)"');
    await new Promise(r => setTimeout(r, 500));
    const status = getProcessStatus('crash-test');
    expect(status.status).toBe('crashed');
  });
});

// ─────────────────────────────────────────────
//  stopProcess
// ─────────────────────────────────────────────

describe('stopProcess', () => {
  test('stops a running process', async () => {
    startProcess('stop-test', 'node -e "setInterval(()=>{},1000)"');
    await new Promise(r => setTimeout(r, 100));
    const result = stopProcess('stop-test');
    expect(result.stopped).toBe(true);
    expect(result.message).toMatch(/SIGTERM/);
  });

  test('returns stopped:false for unknown process', () => {
    const result = stopProcess('nonexistent');
    expect(result.stopped).toBe(false);
    expect(result.message).toMatch(/no process/i);
  });

  test('returns stopped:false for already stopped process', async () => {
    startProcess('already-stopped', 'node -e "process.exit(0)"');
    await new Promise(r => setTimeout(r, 500));
    const result = stopProcess('already-stopped');
    expect(result.stopped).toBe(false);
  });

  test('updates status to stopped', async () => {
    startProcess('status-stop', 'node -e "setInterval(()=>{},1000)"');
    await new Promise(r => setTimeout(r, 100));
    stopProcess('status-stop');
    expect(getProcessStatus('status-stop').status).toBe('stopped');
  });
});

// ─────────────────────────────────────────────
//  getProcessStatus
// ─────────────────────────────────────────────

describe('getProcessStatus', () => {
  test('returns null for unknown process', () => {
    expect(getProcessStatus('unknown')).toBeNull();
  });

  test('returns status object for known process', () => {
    startProcess('status-obj', 'node -e "setInterval(()=>{},1000)"');
    const status = getProcessStatus('status-obj');
    expect(status).not.toBeNull();
    expect(status.name).toBe('status-obj');
    expect(typeof status.pid).toBe('number');
    expect(status.command).toBe('node -e "setInterval(()=>{},1000)"');
  });

  test('includes uptime for running process', async () => {
    startProcess('uptime-test', 'node -e "setInterval(()=>{},1000)"');
    await new Promise(r => setTimeout(r, 100));
    const status = getProcessStatus('uptime-test');
    expect(status.uptime).toMatch(/\d+s/);
  });

  test('uptime is null for stopped process', async () => {
    startProcess('no-uptime', 'node -e "process.exit(0)"');
    await new Promise(r => setTimeout(r, 500));
    const status = getProcessStatus('no-uptime');
    expect(status.uptime).toBeNull();
  });

  test('includes logLines count', async () => {
    startProcess('logcount', 'node -e "console.log(\'a\');console.log(\'b\')"');
    await new Promise(r => setTimeout(r, 300));
    const status = getProcessStatus('logcount');
    expect(typeof status.logLines).toBe('number');
  });
});

// ─────────────────────────────────────────────
//  listProcesses
// ─────────────────────────────────────────────

describe('listProcesses', () => {
  test('returns empty array when no processes', () => {
    expect(listProcesses()).toHaveLength(0);
  });

  test('lists all started processes', () => {
    startProcess('list-a', 'node -e "setInterval(()=>{},1000)"');
    startProcess('list-b', 'node -e "setInterval(()=>{},1000)"');
    const list = listProcesses();
    expect(list).toHaveLength(2);
    expect(list.map(p => p.name)).toContain('list-a');
    expect(list.map(p => p.name)).toContain('list-b');
  });
});

// ─────────────────────────────────────────────
//  getProcessLogs
// ─────────────────────────────────────────────

describe('getProcessLogs', () => {
  test('returns null for unknown process', () => {
    expect(getProcessLogs('unknown')).toBeNull();
  });

  test('returns array of log lines', async () => {
    startProcess('logs-test', 'node -e "console.log(\'line1\');console.log(\'line2\')"');
    await new Promise(r => setTimeout(r, 300));
    const logs = getProcessLogs('logs-test', 50);
    expect(Array.isArray(logs)).toBe(true);
  });

  test('respects lines limit', async () => {
    startProcess('limit-test', 'node -e "for(let i=0;i<20;i++) console.log(\'line\'+i)"');
    await new Promise(r => setTimeout(r, 500));
    const logs = getProcessLogs('limit-test', 5);
    expect(logs.length).toBeLessThanOrEqual(5);
  });

  test('filters by pattern', async () => {
    startProcess('filter-test', 'node -e "console.log(\'error: something\');console.log(\'info: ok\')"');
    await new Promise(r => setTimeout(r, 300));
    const logs = getProcessLogs('filter-test', 50, 'error');
    expect(logs.every(l => /error/i.test(l))).toBe(true);
  });

  test('stdout lines are prefixed with [stdout]', async () => {
    startProcess('prefix-test', 'node -e "console.log(\'test output\')"');
    await new Promise(r => setTimeout(r, 300));
    const logs = getProcessLogs('prefix-test', 50);
    expect(logs.some(l => l.startsWith('[stdout]'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  waitForReady
// ─────────────────────────────────────────────

describe('waitForReady', () => {
  test('returns true when pattern appears in output', async () => {
    startProcess('ready-test', 'node -e "setTimeout(()=>console.log(\'Server ready on port 3000\'),100)"');
    const ready = await waitForReady('ready-test', 'ready', 5_000);
    expect(ready).toBe(true);
  }, 10_000);

  test('returns false for unknown process', async () => {
    const ready = await waitForReady('nonexistent', 'ready', 500);
    expect(ready).toBe(false);
  });

  test('returns false on timeout', async () => {
    startProcess('timeout-test', 'node -e "setInterval(()=>{},1000)"');
    const ready = await waitForReady('timeout-test', 'WILL_NEVER_APPEAR', 300);
    expect(ready).toBe(false);
  }, 5_000);

  test('returns false when process crashes', async () => {
    startProcess('crash-ready', 'node -e "process.exit(1)"');
    const ready = await waitForReady('crash-ready', 'ready', 2_000);
    expect(ready).toBe(false);
  }, 5_000);
});

// ─────────────────────────────────────────────
//  formatProcessList
// ─────────────────────────────────────────────

describe('formatProcessList', () => {
  test('shows no-processes message for empty list', () => {
    const fmt = formatProcessList([]);
    expect(fmt).toMatch(/no background processes/i);
  });

  test('shows process name and status', () => {
    startProcess('fmt-test', 'node -e "setInterval(()=>{},1000)"');
    const list = listProcesses();
    const fmt  = formatProcessList(list);
    expect(fmt).toContain('fmt-test');
    expect(fmt).toContain('running');
  });

  test('shows status icons', () => {
    startProcess('icon-test', 'node -e "setInterval(()=>{},1000)"');
    const fmt = formatProcessList(listProcesses());
    expect(fmt).toContain('🟢');
  });
});

// ─────────────────────────────────────────────
//  formatProcessLogs
// ─────────────────────────────────────────────

describe('formatProcessLogs', () => {
  test('shows not-found message for null logs', () => {
    const fmt = formatProcessLogs('missing', null, 'unknown');
    expect(fmt).toMatch(/no process.*found/i);
  });

  test('shows no-output message for empty logs', () => {
    const fmt = formatProcessLogs('myproc', [], 'running');
    expect(fmt).toMatch(/no output/i);
  });

  test('shows process name and status', () => {
    const fmt = formatProcessLogs('myproc', ['[stdout] hello'], 'running');
    expect(fmt).toContain('myproc');
    expect(fmt).toContain('running');
    expect(fmt).toContain('[stdout] hello');
  });
});

// ─────────────────────────────────────────────
//  Tool registration
// ─────────────────────────────────────────────

describe('Process manager tool registration', () => {
  test('all 4 process tools are registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('start_process');
    expect(Object.keys(TOOLS)).toContain('stop_process');
    expect(Object.keys(TOOLS)).toContain('list_processes');
    expect(Object.keys(TOOLS)).toContain('read_process_logs');
  });

  test('total tool count is now 38', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBe(38);
  });

  test('start_process description mentions wait_for', () => {
    const { TOOLS } = require('../src/tools');
    expect(TOOLS.start_process.description).toMatch(/background/i);
  });
});
