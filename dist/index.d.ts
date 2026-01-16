#!/usr/bin/env node
/**
 * TruffleHog MCP Server
 *
 * This MCP server provides tools for interacting with TruffleHog Enterprise
 * for secret detection and scanning capabilities.
 *
 * TruffleHog Enterprise uses a scanner-based architecture where:
 * - Scanners connect to the TruffleHog API server
 * - Results are sent to the dashboard for viewing
 * - Webhooks notify external systems of findings
 *
 * Environment Variables:
 * - TRUFFLEHOG_API_URL: The TruffleHog Enterprise API URL (e.g., your-namespace.api.c1.prod.trufflehog.org:8443)
 * - TRUFFLEHOG_API_KEY: Scanner token for authentication (e.g., thog-agent-XXXXXXXX)
 * - TRUFFLEHOG_SCANNER_GROUP: Scanner group identifier
 */
export {};
