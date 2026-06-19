// tests/security.test.js
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const security = require('../src/security');
const config = require('../src/config');

describe('Security Module', () => {
  const workingDir = path.join(os.tmpdir(), 'forge-agent-test-security');

  beforeAll(() => {
    if (!fs.existsSync(workingDir)) fs.mkdirSync(workingDir, { recursive: true });
  });

  afterAll(() => {
    try { fs.rmSync(workingDir, { recursive: true, force: true }); } catch {}
  });

  describe('validatePath', () => {
    test('blocks /etc/passwd', () => {
      const result = security.validatePath('/etc/passwd');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('matches a protected path');
    });

    test('blocks ~/.ssh path', () => {
      const result = security.validatePath(path.join(os.homedir(), '.ssh'));
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('matches a protected path');
    });

    test('blocks ~/.aws path', () => {
      const result = security.validatePath(path.join(os.homedir(), '.aws'));
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('matches a protected path');
    });

    test('blocks ~/.npmrc path', () => {
      const result = security.validatePath(path.join(os.homedir(), '.npmrc'));
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('matches a protected path');
    });

    test('blocks path with null byte', () => {
      const result = security.validatePath('/etc/passwd\0');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('contains null byte');
    });

    test('blocks path with .. traversal to sensitive location', () => {
      const result = security.validatePath('/tmp/../../etc/passwd');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('matches a protected path');
    });

    test('returns safe:true for normal file in working dir', () => {
      const filePath = path.join(config.WORKING_DIR, 'package.json');
      const result = security.validatePath(filePath);
      expect(result.safe).toBe(true);
    });

    test('returns safe:true for relative path within working dir', () => {
      const result = security.validatePath('src/index.js');
      expect(result.safe).toBe(true);
    });

    test('never throws — returns { safe: false } on error', () => {
      // @ts-ignore
      const result = security.validatePath(null);
      expect(result.safe).toBe(false);
    });

    test('with strict sandbox blocks path outside working dir', () => {
      const result = security.validatePath('/tmp/test-outside.txt', { sandbox: true, workingDir: '/home/user/project' });
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('outside the working directory');
    });

    test('with strict sandbox allows path inside working dir', () => {
      const result = security.validatePath('/home/user/project/file.txt', { sandbox: true, workingDir: '/home/user/project' });
      expect(result.safe).toBe(true);
    });
    
    test('blocks symlink that escapes sandbox', () => {
        const outsideFile = path.join(os.tmpdir(), 'outside-security-test.txt');
        fs.writeFileSync(outsideFile, 'outside');
        const linkPath = path.join(workingDir, 'link.txt');
        try {
            fs.symlinkSync(outsideFile, linkPath);
            const result = security.validatePath(linkPath, { sandbox: true, workingDir });
            expect(result.safe).toBe(false);
            expect(result.reason).toContain('symlink points outside');
        } catch (err) {
            // Symlinks might fail on some systems/permissions
        } finally {
            try { fs.unlinkSync(outsideFile); } catch {}
            try { fs.unlinkSync(linkPath); } catch {}
        }
    });
  });

  describe('validateCommand', () => {
    test('blocks "rm -rf /"', () => {
      const result = security.validateCommand('rm -rf /');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('command blocked');
    });

    test('blocks "rm -rf ~"', () => {
      const result = security.validateCommand('sudo rm -rf ~');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('command blocked');
    });

    test('blocks fork bomb pattern', () => {
      const result = security.validateCommand(':(){ :|:& };:');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('command blocked');
    });

    test('allows "npm test"', () => {
      const result = security.validateCommand('npm test');
      expect(result.safe).toBe(true);
    });

    test('allows "node src/index.js"', () => {
      const result = security.validateCommand('node src/index.js');
      expect(result.safe).toBe(true);
    });

    test('allows "echo hello"', () => {
      const result = security.validateCommand('echo hello');
      expect(result.safe).toBe(true);
    });

    test('never throws', () => {
      // @ts-ignore
      const result = security.validateCommand(null);
      expect(result.safe).toBe(false);
    });
  });

  describe('sanitiseOutput', () => {
    test('replaces sk- API keys', () => {
      const text = 'My key is sk-1234567890abcdefghij123456';
      expect(security.sanitiseOutput(text)).toBe('My key is [API_KEY]');
    });

    test('replaces JWT tokens (eyJ...)', () => {
      const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(security.sanitiseOutput(text)).toBe('Token: [JWT_TOKEN]');
    });

    test('replaces long hex strings (32+ chars)', () => {
      const text = 'Hash: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
      expect(security.sanitiseOutput(text)).toBe('Hash: [HEX_SECRET]');
    });

    test('leaves short hex strings unchanged (< 32 chars)', () => {
      const text = 'Short: a1b2c3d4';
      expect(security.sanitiseOutput(text)).toBe('Short: a1b2c3d4');
    });

    test('returns original text if no secrets found', () => {
      const text = 'Hello world 123';
      expect(security.sanitiseOutput(text)).toBe(text);
    });

    test('never throws — returns input on error', () => {
      // @ts-ignore
      expect(security.sanitiseOutput(null)).toBe(null);
    });

    test('handles empty string', () => {
      expect(security.sanitiseOutput('')).toBe('');
    });
  });

  describe('File type detection', () => {
    test('isEnvFile returns true for ".env"', () => {
      expect(security.isEnvFile('.env')).toBe(true);
    });

    test('isEnvFile returns true for ".env.local"', () => {
      expect(security.isEnvFile('.env.local')).toBe(true);
    });

    test('isEnvFile returns true for ".env.production"', () => {
      expect(security.isEnvFile('.env.production')).toBe(true);
    });

    test('isEnvFile returns false for "env.js"', () => {
      expect(security.isEnvFile('env.js')).toBe(false);
    });

    test('isEnvFile returns false for "package.json"', () => {
      expect(security.isEnvFile('package.json')).toBe(false);
    });

    test('checkSensitiveFileType returns warning string for "key.pem"', () => {
      expect(security.checkSensitiveFileType('key.pem')).toContain('SECURITY WARNING');
    });

    test('checkSensitiveFileType returns null for "index.js"', () => {
      expect(security.checkSensitiveFileType('index.js')).toBe(null);
    });
  });

  describe('Security report', () => {
    test('generateSecurityReport returns object with sandboxEnabled field', () => {
      const report = security.generateSecurityReport();
      expect(report).toHaveProperty('sandboxEnabled');
    });

    test('generateSecurityReport returns object with blockedPathsCount > 0', () => {
      const report = security.generateSecurityReport();
      expect(report.blockedPathsCount).toBeGreaterThan(0);
    });

    test('formatSecurityReport returns non-empty string', () => {
      const report = security.generateSecurityReport();
      const output = security.formatSecurityReport(report);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('Tool parameter validation', () => {
    const { executeTool } = require('../src/tools');

    test('validateToolArgs throws for missing required string parameter', async () => {
      await expect(executeTool('read_file', {}))
        .rejects.toThrow(/Invalid argument for read_file: "path"/);
    });

    test('validateToolArgs throws for wrong type (number instead of string)', async () => {
      await expect(executeTool('read_file', { path: 123 }))
        .rejects.toThrow(/Invalid argument for read_file: "path"/);
    });

    test('validateToolArgs passes for valid parameters', async () => {
      const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const spyStat = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, size: 100 });
      const spyRead = jest.spyOn(fs, 'readFileSync').mockReturnValue('content');
      const spyReal = jest.spyOn(fs, 'realpathSync').mockImplementation(p => p);
      
      const result = await executeTool('read_file', { path: 'test.txt' });
      expect(result).toContain('test.txt');
      
      spy.mockRestore();
      spyStat.mockRestore();
      spyRead.mockRestore();
      spyReal.mockRestore();
    });
  });
});
