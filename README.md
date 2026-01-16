# TruffleHog MCP Server

MCP server for TruffleHog Enterprise - Secret Detection and Scanning platform by Truffle Security.

## Overview

This MCP server provides tools for interacting with TruffleHog for secret detection and scanning capabilities. It wraps the TruffleHog CLI and provides additional utilities for analyzing findings and generating scanner configurations.

## Prerequisites

- Node.js 18+
- TruffleHog CLI installed (`brew install trufflehog` on macOS)

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `TRUFFLEHOG_API_URL` | TruffleHog Enterprise API URL (e.g., `your-namespace.api.c1.prod.trufflehog.org:8443`) | For Enterprise |
| `TRUFFLEHOG_API_KEY` | Scanner token for authentication (e.g., `thog-agent-XXXXXXXX`) | For Enterprise |
| `TRUFFLEHOG_SCANNER_GROUP` | Scanner group identifier | For Enterprise |
| `TRUFFLEHOG_WEBHOOK_URL` | Webhook URL for notifications | Optional |
| `TRUFFLEHOG_WEBHOOK_TOKEN` | Webhook token for signature verification | Optional |

## Available Tools

### `trufflehog_status`
Check TruffleHog installation status and configuration.

### `scan_git_repo`
Scan a Git repository for secrets. Supports local paths and remote URLs with options for:
- Specific branch scanning
- Commit depth limits
- Verified-only results
- Since-commit filtering
- Detector inclusion/exclusion

### `scan_github_org`
Scan an entire GitHub organization for secrets. Requires a GitHub token for authentication.

### `scan_filesystem`
Scan a local filesystem directory for secrets.

### `scan_s3_bucket`
Scan an AWS S3 bucket for secrets. Requires AWS credentials to be configured.

### `scan_docker_image`
Scan a Docker image for secrets.

### `list_detectors`
List all available secret detectors supported by TruffleHog (800+ types).

### `verify_secret`
Verify if a specific secret is still active/valid by checking against the service's API.

### `generate_config`
Generate a TruffleHog Enterprise scanner configuration file.

### `analyze_finding`
Analyze a secret finding to understand its impact and get remediation guidance.

## Usage with Claude

Once registered in `~/.claude/.claude.json`, the tools will be available in Claude Code.

Example commands:
- "Check if TruffleHog is installed"
- "Scan this repository for secrets"
- "Scan the filesystem at /path/to/project for secrets"
- "Analyze a GitHub token finding"

## TruffleHog Enterprise

For TruffleHog Enterprise features, you'll need:
1. A TruffleHog Enterprise subscription
2. Scanner credentials from your dashboard
3. Configuration of the API URL and token

Enterprise features include:
- Centralized dashboard for viewing findings
- Continuous monitoring
- Webhook notifications
- Secret remediation tracking
- Pre-commit and pre-receive hooks

## References

- [TruffleHog GitHub](https://github.com/trufflesecurity/trufflehog)
- [TruffleHog Documentation](https://docs.trufflesecurity.com/)
- [TruffleHog Enterprise](https://trufflesecurity.com/trufflehog-enterprise)
