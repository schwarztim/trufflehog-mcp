# Architecture Decision Records - TruffleHog MCP Server

## Overview

This document records significant architectural decisions made during the development of the TruffleHog MCP Server. Each decision is documented in ADR (Architecture Decision Record) format.

---

## ADR-001: Use CLI Wrapper Pattern

### Status
Accepted

### Context
We need to provide secret scanning capabilities via MCP. Options include:
1. Native implementation of secret detection in TypeScript
2. Wrapping the existing TruffleHog CLI
3. Using TruffleHog as a library (if available)

### Decision
Wrap the TruffleHog CLI using Node.js child process spawning.

### Rationale
- TruffleHog CLI is mature with 800+ detectors
- Native implementation would require rewriting significant detection logic
- No official TruffleHog library for Node.js exists
- CLI provides verified JSON output format
- Updates to TruffleHog automatically benefit the MCP server

### Consequences
**Positive:**
- Leverage all TruffleHog features immediately
- Reduced development and maintenance burden
- Benefit from TruffleHog security updates

**Negative:**
- External dependency on CLI binary
- Process spawning overhead
- No streaming results during long scans
- Arguments visible in process list

### Alternatives Considered
| Alternative | Reason Not Chosen |
|-------------|-------------------|
| Native TypeScript implementation | Too much effort, 800+ detectors |
| Go library binding | Complex, cross-platform issues |
| TruffleHog as service | Adds deployment complexity |

---

## ADR-002: Use spawn with shell disabled

### Status
Accepted

### Context
Executing external commands from user input poses injection risks. We need to execute the TruffleHog CLI safely.

### Decision
Use the spawn function with shell disabled and pass arguments as an array.

### Rationale
- Spawn with array arguments prevents shell injection
- No shell metacharacter interpretation
- Explicit shell:false documents intent
- Safer than alternatives which use shell by default

### Consequences
**Positive:**
- Command injection attacks are prevented
- Arguments with special characters handled correctly
- Clear security boundary

**Negative:**
- Cannot use shell features (pipes, redirects)
- Each command requires explicit argument parsing

### Code Reference
```typescript
const proc = spawn("trufflehog", args, {
  stdio: ["pipe", "pipe", "pipe"],
  shell: false,
});
```

---

## ADR-003: Single File Architecture

### Status
Accepted (with reservations)

### Context
The MCP server code could be organized as multiple modules or a single file.

### Decision
Keep all code in a single index.ts file (approximately 1000 lines).

### Rationale
- Simple project with limited scope
- Easy to understand full system at once
- No module resolution complexity
- Quick to get started

### Consequences
**Positive:**
- Simple build process
- Easy to read linearly
- No circular dependency issues

**Negative:**
- Harder to test individual components
- Code organization by comments only
- May become unwieldy as features grow

### Future Consideration
Consider refactoring into modules if:
- File exceeds 1500 lines
- Need unit testing
- Adding complex features

---

## ADR-004: Stateless Operation

### Status
Accepted

### Context
The server could maintain state between requests (caching, history) or operate statelessly.

### Decision
Operate completely stateless - no persistence, no caching.

### Rationale
- Simpler implementation
- No state synchronization issues
- Each request is independent
- Reduces attack surface (no stored data)

### Consequences
**Positive:**
- Simple, predictable behavior
- No data retention concerns
- Easy to restart/recover

**Negative:**
- Cannot cache scan results
- Cannot track remediation status
- Repeated scans re-execute fully

---

## ADR-005: Environment Variable Configuration

### Status
Accepted

### Context
Configuration for Enterprise features needs to be provided. Options include:
1. Configuration files
2. Environment variables
3. Command line arguments
4. Interactive prompts

### Decision
Use environment variables exclusively.

### Rationale
- Standard for MCP servers (via claude.json env section)
- No file management complexity
- Secrets not written to disk
- Compatible with container deployment

### Consequences
**Positive:**
- Clean integration with MCP configuration
- Secrets handled by environment
- No config file parsing needed

**Negative:**
- Cannot dynamically change configuration
- Environment must be set before startup
- Limited configuration complexity

### Configuration
```typescript
const config = {
  apiUrl: process.env.TRUFFLEHOG_API_URL || "",
  apiKey: process.env.TRUFFLEHOG_API_KEY || "",
  scannerGroup: process.env.TRUFFLEHOG_SCANNER_GROUP || "",
  webhookUrl: process.env.TRUFFLEHOG_WEBHOOK_URL || "",
  webhookToken: process.env.TRUFFLEHOG_WEBHOOK_TOKEN || "",
};
```

---

## ADR-006: Markdown Output Format

### Status
Accepted

### Context
Tool responses could be formatted as:
1. Raw JSON
2. Markdown
3. Plain text
4. HTML

### Decision
Return Markdown-formatted responses for all tools.

### Rationale
- Markdown renders well in AI interfaces
- Supports headers, tables, code blocks
- Human-readable as plain text fallback
- AI can parse structure if needed

### Consequences
**Positive:**
- Consistent, readable output
- Good rendering in Claude
- Supports rich formatting

**Negative:**
- More processing than raw JSON
- Formatting logic in code
- May need adjustment for different clients

---

## ADR-007: Rely on CLI for Secret Redaction

### Status
Accepted

### Context
Detected secrets must be redacted before display. Options:
1. Implement redaction in MCP server
2. Use TruffleHog built-in redaction
3. Both layers

### Decision
Rely on TruffleHog CLI Redacted field, never access Raw field.

### Rationale
- TruffleHog already implements proper redaction
- Consistent redaction across all use cases
- Reduced risk of exposing secrets
- Single point of redaction logic

### Consequences
**Positive:**
- Secrets never exposed by MCP server
- Consistent with CLI behavior
- Less code to maintain

**Negative:**
- Dependent on CLI redaction quality
- Cannot customize redaction format
- Raw data flows through process memory

---

## ADR-008: Temp Files for Secret Verification

### Status
Accepted (with known risk)

### Context
The verify_secret tool needs to pass a secret to TruffleHog CLI for verification. Options:
1. Write to temp file, scan file
2. Pass via stdin
3. Pass as CLI argument

### Decision
Write secret to temp file, scan, delete immediately.

### Rationale
- TruffleHog filesystem scanner is reliable
- Stdin approach would need custom CLI modifications
- CLI arguments would be visible in process list

### Consequences
**Positive:**
- Works with existing TruffleHog capabilities
- Secret not in process list
- File deleted after use

**Negative:**
- Brief window where secret exists on disk
- Race condition possible
- Cleanup may fail on crash

### Mitigation
Consider using fs.open with exclusive flag and immediate unlink on Unix.

---

## ADR-009: Include Remediation Guidance

### Status
Accepted

### Context
Users finding secrets need guidance on remediation. Options:
1. Just report findings
2. Include generic guidance
3. Include detector-specific guidance
4. Link to external documentation

### Decision
Include detector-specific remediation guidance in analyze_finding tool.

### Rationale
- Developers need actionable next steps
- Generic guidance is less helpful
- AI can contextualize the guidance
- Reduces need to search documentation

### Consequences
**Positive:**
- Actionable security guidance
- Faster remediation
- Better developer experience

**Negative:**
- Guidance may become outdated
- Cannot cover all secret types
- Maintenance burden

---

## ADR-010: No Authentication for MCP Protocol

### Status
Accepted (constrained by MCP design)

### Context
MCP protocol could have authentication. Current MCP standard does not include authentication.

### Decision
Accept MCP design - no authentication at protocol level.

### Rationale
- MCP servers run locally
- Process isolation provides access control
- Only registered MCP clients can connect
- Adding auth would break MCP compatibility

### Consequences
**Positive:**
- Simple implementation
- Standard MCP compliance
- No credential management

**Negative:**
- No client verification
- Relies on OS-level security
- Any local process could potentially connect

### Mitigation
- Run MCP server with minimal privileges
- Rely on OS user isolation
- Enterprise auth via environment variables

---

## Decision Log Summary

| ADR | Decision | Status | Risk |
|-----|----------|--------|------|
| 001 | CLI wrapper pattern | Accepted | Low |
| 002 | Spawn with shell disabled | Accepted | Low |
| 003 | Single file architecture | Accepted | Medium |
| 004 | Stateless operation | Accepted | Low |
| 005 | Environment variable config | Accepted | Low |
| 006 | Markdown output format | Accepted | Low |
| 007 | CLI-based secret redaction | Accepted | Low |
| 008 | Temp files for verification | Accepted | Medium |
| 009 | Include remediation guidance | Accepted | Low |
| 010 | No MCP authentication | Accepted | Medium |

## Open Decisions

| Topic | Options | Considerations |
|-------|---------|----------------|
| Unit testing strategy | Jest, Vitest, none | Currently no tests |
| Modularization | Refactor to modules | If complexity grows |
| HTTP transport | Add HTTP mode | For remote deployment |
| Caching | Add result caching | For repeated scans |

## Open Questions and Gaps

1. **No Testing ADR**: Decision to not include tests was implicit
2. **Dependency Selection**: No documented rationale for axios/yaml deps
3. **Error Handling Strategy**: No formal error handling decision
4. **Logging Strategy**: No decision on logging approach
5. **Version Strategy**: No semantic versioning policy documented
