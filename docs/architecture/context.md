# System Context - TruffleHog MCP Server

## Overview

The TruffleHog MCP Server is a Model Context Protocol (MCP) server that wraps the TruffleHog CLI, providing AI assistants (like Claude) with secret detection and scanning capabilities. It acts as a bridge between AI-powered development environments and TruffleHog's security scanning infrastructure.

## C4 Level 1: System Context Diagram

```mermaid
C4Context
    title System Context Diagram - TruffleHog MCP Server

    Person(developer, "Developer", "Uses AI assistant for development tasks")

    System_Boundary(mcp_boundary, "MCP Environment") {
        System(ai_assistant, "AI Assistant", "Claude or other MCP-compatible AI")
        System(trufflehog_mcp, "TruffleHog MCP Server", "MCP server providing secret scanning tools via TruffleHog CLI wrapper")
    }

    System_Ext(trufflehog_cli, "TruffleHog CLI", "Open-source secret scanner binary")
    System_Ext(trufflehog_enterprise, "TruffleHog Enterprise", "Enterprise dashboard and API")
    System_Ext(git_repos, "Git Repositories", "GitHub, GitLab, Bitbucket, local repos")
    System_Ext(cloud_storage, "Cloud Storage", "AWS S3, GCS buckets")
    System_Ext(docker_registry, "Docker Registries", "Docker Hub, ECR, GCR")
    System_Ext(secret_services, "Secret Services", "AWS, GitHub, Slack APIs for verification")

    Rel(developer, ai_assistant, "Interacts with")
    Rel(ai_assistant, trufflehog_mcp, "Invokes tools via MCP protocol", "stdio/JSON-RPC")
    Rel(trufflehog_mcp, trufflehog_cli, "Executes scans", "child_process spawn")
    Rel(trufflehog_cli, git_repos, "Scans for secrets", "HTTPS/SSH")
    Rel(trufflehog_cli, cloud_storage, "Scans for secrets", "AWS/GCP SDK")
    Rel(trufflehog_cli, docker_registry, "Scans images", "Docker API")
    Rel(trufflehog_cli, secret_services, "Verifies secrets", "HTTPS")
    Rel(trufflehog_mcp, trufflehog_enterprise, "Sends results (Enterprise)", "HTTPS:8443")
```

## Actors and Systems

### Primary Actors

| Actor | Description | Interaction |
|-------|-------------|-------------|
| Developer | Security-conscious developer using AI assistance | Initiates scans through natural language requests |
| AI Assistant | Claude or other MCP-compatible AI | Translates requests to MCP tool calls |

### Internal Systems

| System | Description | Role |
|--------|-------------|------|
| TruffleHog MCP Server | Node.js MCP server | Bridges MCP protocol to TruffleHog CLI |

### External Systems

| System | Description | Integration |
|--------|-------------|-------------|
| TruffleHog CLI | Open-source secret scanner | Child process execution via spawn |
| TruffleHog Enterprise | Commercial dashboard/API | Optional HTTPS API for result aggregation |
| Git Repositories | Source code hosts | Target for git-based scans |
| Cloud Storage (S3/GCS) | Object storage | Target for bucket scans |
| Docker Registries | Container image storage | Target for image layer scans |
| Secret Service APIs | AWS, GitHub, Slack, etc. | Used for active secret verification |

## Communication Patterns

### MCP Protocol Communication

```mermaid
sequenceDiagram
    participant D as Developer
    participant AI as AI Assistant
    participant MCP as TruffleHog MCP
    participant CLI as TruffleHog CLI
    participant Target as Scan Target

    D->>AI: "Scan this repo for secrets"
    AI->>MCP: CallToolRequest (scan_git_repo)
    MCP->>CLI: spawn("trufflehog", ["git", ...])
    CLI->>Target: Clone/scan repository
    Target-->>CLI: Repository contents
    CLI->>CLI: Detect secrets (800+ detectors)
    CLI-->>MCP: JSON findings via stdout
    MCP->>MCP: Parse and format findings
    MCP-->>AI: CallToolResponse (formatted results)
    AI-->>D: "Found X secrets..."
```

### Transport Protocol

- **MCP Transport**: stdio (stdin/stdout)
- **Message Format**: JSON-RPC 2.0
- **CLI Communication**: Child process with separate stdout/stderr streams

## Trust Boundaries

```mermaid
graph TB
    subgraph "User Trust Domain"
        Developer[Developer]
        AI[AI Assistant]
    end

    subgraph "Local Machine Trust Domain"
        MCP[TruffleHog MCP Server]
        CLI[TruffleHog CLI]
        FS[Local Filesystem]
    end

    subgraph "External Trust Domain"
        GH[GitHub]
        AWS[AWS S3]
        Docker[Docker Hub]
        Enterprise[TruffleHog Enterprise]
    end

    Developer --> AI
    AI -->|MCP Protocol| MCP
    MCP -->|spawn| CLI
    CLI -->|read| FS
    CLI -->|HTTPS| GH
    CLI -->|SDK| AWS
    CLI -->|API| Docker
    MCP -.->|Optional| Enterprise

    classDef trusted fill:#90EE90
    classDef local fill:#87CEEB
    classDef external fill:#FFB6C1

    class Developer,AI trusted
    class MCP,CLI,FS local
    class GH,AWS,Docker,Enterprise external
```

## Key Responsibilities

### TruffleHog MCP Server

1. **Tool Registration**: Exposes 10 scanning and analysis tools via MCP
2. **Input Validation**: Validates paths and sanitizes inputs before CLI execution
3. **CLI Orchestration**: Safely spawns TruffleHog CLI with proper arguments
4. **Output Parsing**: Parses JSON output from TruffleHog and formats for AI consumption
5. **Configuration Management**: Manages Enterprise configuration via environment variables
6. **Remediation Guidance**: Provides contextual remediation advice for findings

### TruffleHog CLI (External)

1. **Secret Detection**: 800+ detector types for various secret formats
2. **Verification**: Active verification of secrets against service APIs
3. **Multi-source Scanning**: Git, filesystem, S3, Docker, GitHub org scanning
4. **History Analysis**: Scans full git history for historical secrets

## Open Questions and Gaps

1. **No Rate Limiting**: The MCP server does not implement rate limiting for scan requests
2. **No Caching**: Repeated scans of the same target always re-execute
3. **No Progress Reporting**: Long-running scans provide no intermediate progress updates
4. **Enterprise Integration**: Dashboard integration is configuration-only; no bidirectional sync
5. **Credential Management**: GitHub/AWS tokens passed as arguments (visible in process list)
