# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.4.x   | ✅ Yes    |
| 1.3.x   | ✅ Yes    |
| < 1.3   | ❌ No     |

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

If you discover a security vulnerability, please report it through one of the following methods:

1. **GitHub Security Advisory (Preferred):**
   Go to [https://github.com/Omar-Azam/forge-agent/security/advisories/new](https://github.com/Omar-Azam/forge-agent/security/advisories/new) to open a private advisory.

2. **Direct Contact:**
   If you cannot use the GitHub advisory system, please email the maintainer directly for critical vulnerabilities.

### Please include in your report:
- A detailed description of the vulnerability.
- Clear steps to reproduce the issue.
- Potential impact and severity.
- A suggested fix or mitigation (if you have one).

## What to Expect
- **Acknowledgement:** Within 48 hours.
- **Assessment:** Within 7 days.
- **Fix and Release:** Within 30 days for critical issues.
- **Credit:** We will gladly give credit in our release notes if desired.

## Security Features in Forge Agent

### Path Sandbox
Forge Agent validates all file operations against a strictly maintained blocked-paths list. Sensitive system files, SSH keys, AWS credentials, and GPG keys are always protected. The optional `STRICT_SANDBOX` mode can be enabled to block all file access outside the current working directory.

### Secret Masking
When reading `.env` files, Forge Agent automatically identifies and masks values that match secret patterns (such as tokens, passwords, and API keys). These values are never sent to the AI service; the agent only sees the variable names.

### No Persistent API Keys
Forge Agent does not store or transmit API keys for the services it automates. It uses browser automation to interact with AI web interfaces in the same way a human user would, using local browser sessions.

### Browser Session Isolation
Each AI model uses a separate, persistent browser session stored locally on your machine in `~/.deepseek-agent/session/`. These sessions are never shared or uploaded to any third-party service.

## Scope
The following are **IN scope** for security reports:
- Path traversal attacks allowing access to protected files.
- Accidental exposure of secrets or credentials.
- Potential for remote code execution via specifically crafted AI responses.
- Session hijacking or data leakage between local browser sessions.

The following are **OUT of scope**:
- The security of the AI services themselves (DeepSeek, ChatGPT, Gemini).
- Issues that require physical access to the machine.
- Self-XSS or minor UI issues in the documentation site.
