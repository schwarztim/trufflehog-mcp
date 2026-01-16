# Changelog

All notable changes to the TruffleHog MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-16

### Added
- **New GitLab scanning tool** (`scan_gitlab`) with support for GitLab.com and self-hosted instances
  - Uses GitLab V3 detector (2024 update)
  - Supports group and project-level scanning
- **Updated detector list** with 900+ detectors (up from 800+)
  - Added 2025 analyzers: Plaid, Netlify, Fastly, Monday, Datadog, Ngrok, Mux, Posthog, Dropbox, Databricks, Jira
  - Added Salesforce OAuth2 detector
  - Updated JWT detector with enhanced verification (2024 update)
- Graceful startup validation with informative warnings when TruffleHog CLI is not installed
- Version detection on startup with logging

### Performance Improvements
- **CLI installation check caching** (1-minute TTL)
  - Eliminates redundant `trufflehog --version` calls on every tool invocation
  - Shared cache between `isTruffleHogInstalled()` and `getTruffleHogVersion()`
  - Significant performance boost for multiple scan operations
- **Optimized temporary file handling** in `verify_secret`
  - Uses `finally` block for guaranteed cleanup
  - Restricts file permissions (0600) for security
  - Uses crypto-random suffixes instead of timestamps

### Security
- Enhanced temporary file security with restricted permissions (mode 0o600)
- Improved error handling with proper error message extraction
- No hardcoded secrets detected in codebase

### Changed
- Bumped version from 1.0.0 to 1.1.0
- Updated detector count in documentation (800+ → 900+)
- Improved error messages with better type safety

### Fixed
- Better cleanup of temporary files using `finally` blocks
- More robust error handling in main server initialization

## [1.0.0] - 2026-01-16

### Added
- Initial release of TruffleHog MCP Server
- Support for scanning Git repositories
- Support for scanning GitHub organizations
- Support for scanning local filesystems
- Support for scanning S3 buckets
- Support for scanning Docker images
- Secret verification functionality
- Detector listing
- Configuration file generation
- Finding analysis with remediation guidance
- 800+ secret detector support
