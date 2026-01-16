# Data Flow Architecture - TruffleHog MCP Server

## Overview

This document describes how data flows through the TruffleHog MCP Server, including trust boundaries, data transformations, and sensitive data handling.

## High-Level Data Flow Diagram

```mermaid
flowchart TB
    subgraph "User Trust Domain"
        User[Developer]
        AI[AI Assistant]
    end

    subgraph "MCP Server Trust Domain"
        Input[Input Validation]
        Handler[Tool Handler]
        Executor[CLI Executor]
        Parser[Finding Parser]
        Formatter[Result Formatter]
    end

    subgraph "CLI Trust Domain"
        CLI[TruffleHog CLI]
        Detectors[800+ Detectors]
    end

    subgraph "External Trust Domain"
        Targets[(Scan Targets)]
        Verifiers[Verification APIs]
        Enterprise[Enterprise API]
    end

    User -->|Natural Language| AI
    AI -->|MCP Tool Call| Input
    Input -->|Validated Args| Handler
    Handler -->|CLI Args| Executor
    Executor -->|spawn| CLI
    CLI -->|Scan Request| Targets
    Targets -->|Content| CLI
    CLI -->|Pattern Match| Detectors
    Detectors -->|Findings| CLI
    CLI -.->|Verify| Verifiers
    Verifiers -.->|Status| CLI
    CLI -->|JSON stdout| Executor
    Executor -->|Raw Output| Parser
    Parser -->|Findings[]| Formatter
    Formatter -->|Markdown| AI
    AI -->|Human Readable| User
    Handler -.->|Config| Enterprise
```

## Data Flow by Scan Type

### Git Repository Scan

```mermaid
sequenceDiagram
    participant User
    participant AI
    participant MCP as MCP Server
    participant CLI as TruffleHog
    participant Git as Git Server/Local

    User->>AI: "Scan https://github.com/org/repo"
    AI->>MCP: CallTool(scan_git_repo, {target: "..."})

    rect rgb(200, 230, 200)
        Note over MCP: Input Validation
        MCP->>MCP: Validate URL format
    end

    MCP->>CLI: spawn(["git", url, "--json"])
    CLI->>Git: git clone (shallow)
    Git-->>CLI: Repository contents
    CLI->>CLI: Scan all commits
    CLI->>CLI: Apply 800+ detectors
    CLI->>CLI: Entropy analysis

    opt Verification Enabled
        CLI->>External: Verify secrets
        External-->>CLI: Active/Inactive
    end

    CLI-->>MCP: JSON findings (stdout)

    rect rgb(230, 200, 200)
        Note over MCP: Sensitive Data Handling
        MCP->>MCP: Parse findings
        MCP->>MCP: Secrets already redacted by CLI
    end

    MCP-->>AI: Formatted markdown
    AI-->>User: "Found X secrets..."
```

### Filesystem Scan

```mermaid
sequenceDiagram
    participant User
    participant AI
    participant MCP as MCP Server
    participant CLI as TruffleHog
    participant FS as Local Filesystem

    User->>AI: "Scan /path/to/project"
    AI->>MCP: CallTool(scan_filesystem, {path: "..."})

    rect rgb(200, 230, 200)
        Note over MCP: Path Validation
        MCP->>MCP: Resolve absolute path
        MCP->>MCP: Check for null bytes
    end

    MCP->>CLI: spawn(["filesystem", path, "--json"])
    CLI->>FS: Read directory tree
    FS-->>CLI: File contents
    CLI->>CLI: Pattern matching
    CLI->>CLI: Entropy analysis
    CLI-->>MCP: JSON findings
    MCP->>MCP: Parse and format
    MCP-->>AI: Markdown results
    AI-->>User: Findings summary
```

### Secret Verification Flow

```mermaid
sequenceDiagram
    participant User
    participant AI
    participant MCP as MCP Server
    participant FS as Temp File
    participant CLI as TruffleHog
    participant API as Service API

    User->>AI: "Verify this AWS key"
    AI->>MCP: CallTool(verify_secret, {secret, detectorType})

    rect rgb(255, 230, 200)
        Note over MCP,FS: Temporary Storage
        MCP->>FS: Write secret to temp file
    end

    MCP->>CLI: spawn(["filesystem", tempFile, "--json", "--include-detectors", type])
    CLI->>FS: Read temp file
    CLI->>CLI: Detect secret
    CLI->>API: Test credentials
    API-->>CLI: Valid/Invalid
    CLI-->>MCP: JSON with verification status

    rect rgb(255, 230, 200)
        Note over MCP,FS: Cleanup
        MCP->>FS: Delete temp file
    end

    MCP->>MCP: Format result
    MCP-->>AI: Verification status
    AI-->>User: "Secret is ACTIVE" or "Could not verify"
```

## Trust Boundary Analysis

```mermaid
graph TB
    subgraph TB1["Trust Boundary 1: User-AI"]
        User[Developer]
        AI[AI Assistant]
    end

    subgraph TB2["Trust Boundary 2: MCP Protocol"]
        MCP[MCP Server]
    end

    subgraph TB3["Trust Boundary 3: System Process"]
        CLI[TruffleHog CLI]
    end

    subgraph TB4["Trust Boundary 4: Network"]
        Remote[Remote Services]
    end

    User -.->|Trust| AI
    AI -->|Controlled Protocol| MCP
    MCP -->|Isolated Process| CLI
    CLI -->|Credentials Required| Remote

    classDef trusted fill:#90EE90
    classDef semi fill:#FFE4B5
    classDef untrusted fill:#FFB6C1

    class User,AI trusted
    class MCP,CLI semi
    class Remote untrusted
```

### Trust Boundary Descriptions

| Boundary | From | To | Protection |
|----------|------|-----|------------|
| TB1 | User | AI | Natural language interpretation |
| TB2 | AI | MCP | JSON-RPC schema validation |
| TB3 | MCP | CLI | Argument sanitization, no shell |
| TB4 | CLI | Remote | TLS, authentication tokens |

## Sensitive Data Paths

### Credentials Flow

```mermaid
flowchart LR
    subgraph "Input"
        GHToken[GitHub Token]
        AWSCreds[AWS Credentials]
        Secret[Secret to Verify]
    end

    subgraph "Processing"
        Args[CLI Arguments]
        TempFile[Temp File]
        EnvVar[Environment Variables]
    end

    subgraph "Output"
        Redacted[Redacted in Results]
        Verified[Verification Status Only]
    end

    GHToken -->|--token arg| Args
    AWSCreds -->|AWS SDK| EnvVar
    Secret -->|Write| TempFile
    TempFile -->|Delete after| Verified
    Args -->|Visible in ps| Redacted

    style GHToken fill:#FFB6C1
    style AWSCreds fill:#FFB6C1
    style Secret fill:#FFB6C1
    style Args fill:#FFE4B5
    style TempFile fill:#FFE4B5
```

### Data Classification

| Data Type | Classification | Handling |
|-----------|---------------|----------|
| Scan Target URLs | Low | Passed to CLI, logged |
| GitHub Tokens | High | Passed as CLI argument (visible in process list) |
| AWS Credentials | High | Via environment/AWS SDK |
| Detected Secrets | Critical | Redacted by TruffleHog CLI |
| Verification Results | Medium | Active/inactive status only |
| Enterprise API Keys | High | Environment variable only |

## Data Transformations

### Input Transformation

```mermaid
flowchart LR
    A[User Request] -->|NL| B[AI Interpretation]
    B -->|JSON| C[MCP CallTool]
    C -->|Parse| D[Args Object]
    D -->|Validate| E[Sanitized Args]
    E -->|Build| F[CLI Command Array]
```

### Output Transformation

```mermaid
flowchart LR
    A[CLI stdout] -->|Split lines| B[JSON Lines]
    B -->|Parse each| C[Finding Objects]
    C -->|Map| D[Formatted Findings]
    D -->|Join| E[Markdown Document]
    E -->|MCP Response| F[AI Display]
```

### Finding Data Structure

```typescript
// Input (from CLI)
{
  "SourceMetadata": {"Data": {...}},
  "DetectorName": "AWS",
  "Verified": true,
  "Raw": "AKIAIOSFODNN7EXAMPLE",  // Sensitive
  "Redacted": "AKIAIOSFODNN7E***"  // Safe
}

// Output (to AI)
## Finding 1
- **Detector**: AWS
- **Verified**: Yes
- **Redacted Secret**: AKIAIOSFODNN7E***
```

## Data Retention

| Data | Retention | Location |
|------|-----------|----------|
| Input arguments | In-memory during call | MCP process |
| CLI output | In-memory during parsing | MCP process |
| Temp files (verify) | Deleted after use | OS temp directory |
| Config files | Until manually deleted | User-specified path |
| Enterprise results | Per Enterprise policy | Enterprise cloud |

## Error Data Flow

```mermaid
flowchart TB
    subgraph "Error Sources"
        CLIError[CLI Error]
        ParseError[Parse Error]
        ValidationError[Validation Error]
    end

    subgraph "Error Handling"
        Catch[Try/Catch]
        Format[Error Message]
    end

    subgraph "Error Output"
        Response[MCP Response isError:true]
    end

    CLIError -->|stderr| Catch
    ParseError -->|exception| Catch
    ValidationError -->|throw| Catch
    Catch --> Format
    Format --> Response
```

## Data Flow Security Controls

### Input Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| Path validation | `validatePath()` function | Implemented |
| Null byte rejection | Check for `\0` | Implemented |
| Shell injection prevention | `spawn()` with args array | Implemented |
| URL validation | None | Not Implemented |
| Command injection | No shell execution | Implemented |

### Output Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| Secret redaction | TruffleHog CLI built-in | Implemented |
| Raw secret filtering | Redacted field used | Implemented |
| Error message sanitization | None | Not Implemented |

## Open Questions and Gaps

1. **Token Exposure**: GitHub tokens visible in process list via CLI arguments
2. **No Input Size Limits**: Large inputs could cause memory issues
3. **No Output Truncation**: Very large outputs returned fully
4. **Temp File Race Condition**: Brief window where secret exists on disk
5. **No Audit Trail**: Data flows not logged for compliance
6. **Error Message Leakage**: Errors may contain sensitive path information
7. **No Data Encryption**: Data in transit within process is plaintext
