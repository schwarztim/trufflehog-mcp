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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { spawn, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// Configuration from environment
const config = {
    apiUrl: process.env.TRUFFLEHOG_API_URL || "",
    apiKey: process.env.TRUFFLEHOG_API_KEY || "",
    scannerGroup: process.env.TRUFFLEHOG_SCANNER_GROUP || "",
    webhookUrl: process.env.TRUFFLEHOG_WEBHOOK_URL || "",
    webhookToken: process.env.TRUFFLEHOG_WEBHOOK_TOKEN || "",
};
// Check if TruffleHog CLI is installed
function isTruffleHogInstalled() {
    try {
        execFileSync("trufflehog", ["--version"], { stdio: "pipe" });
        return true;
    }
    catch {
        return false;
    }
}
// Get TruffleHog version
function getTruffleHogVersion() {
    try {
        const result = execFileSync("trufflehog", ["--version"], { encoding: "utf-8" });
        return result.trim();
    }
    catch {
        return "Not installed";
    }
}
// Execute TruffleHog scan with given arguments using spawn (safer than exec)
async function executeTruffleHogScan(args) {
    return new Promise((resolve) => {
        const stdout = [];
        const stderr = [];
        // Using spawn with explicit arguments array prevents shell injection
        const proc = spawn("trufflehog", args, {
            stdio: ["pipe", "pipe", "pipe"],
            shell: false, // Explicitly disable shell to prevent injection
        });
        proc.stdout.on("data", (data) => {
            stdout.push(data.toString());
        });
        proc.stderr.on("data", (data) => {
            stderr.push(data.toString());
        });
        proc.on("close", (code) => {
            resolve({
                stdout: stdout.join(""),
                stderr: stderr.join(""),
                exitCode: code ?? 0,
            });
        });
        proc.on("error", (err) => {
            resolve({
                stdout: stdout.join(""),
                stderr: `Error executing trufflehog: ${err.message}`,
                exitCode: 1,
            });
        });
    });
}
function parseFindings(output) {
    const findings = [];
    const lines = output.trim().split("\n");
    for (const line of lines) {
        if (!line.trim())
            continue;
        try {
            const finding = JSON.parse(line);
            findings.push(finding);
        }
        catch {
            // Not a JSON line, skip
        }
    }
    return findings;
}
// Format findings for display
function formatFindings(findings) {
    if (findings.length === 0) {
        return "No secrets found.";
    }
    const formatted = findings.map((f, i) => {
        return `
## Finding ${i + 1}
- **Detector**: ${f.DetectorName}
- **Verified**: ${f.Verified ? "Yes" : "No"}
- **Source**: ${f.SourceName}
- **Redacted Secret**: ${f.Redacted}
- **Extra Data**: ${JSON.stringify(f.ExtraData, null, 2)}
- **Source Metadata**: ${JSON.stringify(f.SourceMetadata?.Data || {}, null, 2)}
`;
    });
    return `# TruffleHog Scan Results

Found ${findings.length} secret(s):
${formatted.join("\n---\n")}
`;
}
// Generate scanner configuration file
function generateScannerConfig(options) {
    const configContent = {};
    if (config.apiUrl) {
        configContent.trufflehogAddress = config.apiUrl;
    }
    if (config.apiKey) {
        configContent.trufflehogScannerToken = config.apiKey;
    }
    if (config.scannerGroup) {
        configContent.trufflehogScannerGroup = config.scannerGroup;
    }
    if (options.sources) {
        configContent.sources = options.sources;
    }
    if (options.notifiers) {
        configContent.notifiers = options.notifiers;
    }
    return JSON.stringify(configContent, null, 2);
}
// Validate input paths to prevent directory traversal
function validatePath(inputPath) {
    // Resolve to absolute path and normalize
    const resolvedPath = path.resolve(inputPath);
    // Basic validation - ensure it doesn't contain dangerous patterns
    if (inputPath.includes('\0')) {
        throw new Error("Invalid path: contains null bytes");
    }
    return resolvedPath;
}
// Define MCP tools
const tools = [
    {
        name: "trufflehog_status",
        description: "Check TruffleHog installation status and configuration. Returns whether TruffleHog CLI is installed and the current configuration.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "scan_git_repo",
        description: "Scan a Git repository for secrets using TruffleHog. Supports local paths and remote URLs. Can scan entire history or specific branches.",
        inputSchema: {
            type: "object",
            properties: {
                target: {
                    type: "string",
                    description: "Git repository URL or local path to scan",
                },
                branch: {
                    type: "string",
                    description: "Specific branch to scan (optional, scans all by default)",
                },
                maxDepth: {
                    type: "number",
                    description: "Maximum commit depth to scan (optional)",
                },
                onlyVerified: {
                    type: "boolean",
                    description: "Only return verified secrets (default: false)",
                },
                sinceCommit: {
                    type: "string",
                    description: "Only scan commits since this commit hash (optional)",
                },
                includeDetectors: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of detector types to include (optional)",
                },
                excludeDetectors: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of detector types to exclude (optional)",
                },
            },
            required: ["target"],
        },
    },
    {
        name: "scan_github_org",
        description: "Scan an entire GitHub organization for secrets. Requires a GitHub token for authentication.",
        inputSchema: {
            type: "object",
            properties: {
                org: {
                    type: "string",
                    description: "GitHub organization name to scan",
                },
                token: {
                    type: "string",
                    description: "GitHub personal access token for authentication",
                },
                includeRepos: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific repositories to include (optional)",
                },
                excludeRepos: {
                    type: "array",
                    items: { type: "string" },
                    description: "Repositories to exclude from scan (optional)",
                },
                onlyVerified: {
                    type: "boolean",
                    description: "Only return verified secrets (default: false)",
                },
            },
            required: ["org"],
        },
    },
    {
        name: "scan_filesystem",
        description: "Scan a local filesystem directory for secrets. Useful for scanning codebases, config files, and other local files.",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Local directory path to scan",
                },
                excludePaths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Paths to exclude from scan (optional)",
                },
                onlyVerified: {
                    type: "boolean",
                    description: "Only return verified secrets (default: false)",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "scan_s3_bucket",
        description: "Scan an AWS S3 bucket for secrets. Requires AWS credentials to be configured.",
        inputSchema: {
            type: "object",
            properties: {
                bucket: {
                    type: "string",
                    description: "S3 bucket name to scan",
                },
                prefix: {
                    type: "string",
                    description: "S3 key prefix to filter objects (optional)",
                },
                onlyVerified: {
                    type: "boolean",
                    description: "Only return verified secrets (default: false)",
                },
            },
            required: ["bucket"],
        },
    },
    {
        name: "scan_docker_image",
        description: "Scan a Docker image for secrets. Searches through image layers and filesystem.",
        inputSchema: {
            type: "object",
            properties: {
                image: {
                    type: "string",
                    description: "Docker image name and tag to scan (e.g., 'nginx:latest')",
                },
                onlyVerified: {
                    type: "boolean",
                    description: "Only return verified secrets (default: false)",
                },
            },
            required: ["image"],
        },
    },
    {
        name: "list_detectors",
        description: "List all available secret detectors supported by TruffleHog. Shows detector names and types.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "verify_secret",
        description: "Verify if a specific secret is still active/valid. TruffleHog will check against the service's API.",
        inputSchema: {
            type: "object",
            properties: {
                secret: {
                    type: "string",
                    description: "The secret value to verify",
                },
                detectorType: {
                    type: "string",
                    description: "Type of detector to use for verification (e.g., 'github', 'aws', 'slack')",
                },
            },
            required: ["secret", "detectorType"],
        },
    },
    {
        name: "generate_config",
        description: "Generate a TruffleHog Enterprise scanner configuration file. This config can be used with the TruffleHog scanner binary.",
        inputSchema: {
            type: "object",
            properties: {
                outputPath: {
                    type: "string",
                    description: "Path where to save the configuration file (optional)",
                },
                sources: {
                    type: "array",
                    description: "List of sources to configure for scanning",
                    items: {
                        type: "object",
                        properties: {
                            type: {
                                type: "string",
                                enum: [
                                    "github",
                                    "gitlab",
                                    "bitbucket",
                                    "s3",
                                    "gcs",
                                    "slack",
                                    "jira",
                                    "confluence",
                                    "filesystem",
                                ],
                            },
                            config: {
                                type: "object",
                                description: "Source-specific configuration",
                            },
                        },
                    },
                },
                enableWebhook: {
                    type: "boolean",
                    description: "Enable webhook notifications for findings",
                },
                webhookUrl: {
                    type: "string",
                    description: "Webhook URL for notifications",
                },
            },
            required: [],
        },
    },
    {
        name: "analyze_finding",
        description: "Analyze a secret finding to understand its impact, permissions, and associated resources. Provides remediation guidance.",
        inputSchema: {
            type: "object",
            properties: {
                detectorType: {
                    type: "string",
                    description: "Type of secret detected (e.g., 'AWS', 'GitHub', 'Slack')",
                },
                verified: {
                    type: "boolean",
                    description: "Whether the secret was verified as active",
                },
                sourceType: {
                    type: "string",
                    description: "Where the secret was found (e.g., 'git', 'filesystem')",
                },
                extraData: {
                    type: "object",
                    description: "Additional context about the finding",
                },
            },
            required: ["detectorType"],
        },
    },
];
// Handle tool execution
async function handleToolCall(name, args) {
    switch (name) {
        case "trufflehog_status": {
            const installed = isTruffleHogInstalled();
            const version = getTruffleHogVersion();
            return `# TruffleHog Status

## Installation
- **Installed**: ${installed ? "Yes" : "No"}
- **Version**: ${version}

## Configuration
- **API URL**: ${config.apiUrl || "Not configured"}
- **API Key**: ${config.apiKey ? "Configured (hidden)" : "Not configured"}
- **Scanner Group**: ${config.scannerGroup || "Not configured"}
- **Webhook URL**: ${config.webhookUrl || "Not configured"}

## Notes
${!installed
                ? `
TruffleHog CLI is not installed. Install it with:
\`\`\`bash
# macOS
brew install trufflehog

# Linux/Windows
# Download from https://github.com/trufflesecurity/trufflehog/releases
\`\`\`
`
                : "TruffleHog CLI is ready to use."}
`;
        }
        case "scan_git_repo": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            const target = args.target;
            const cmdArgs = ["git", target, "--json"];
            if (args.branch) {
                cmdArgs.push("--branch", args.branch);
            }
            if (args.maxDepth) {
                cmdArgs.push("--max-depth", String(args.maxDepth));
            }
            if (args.onlyVerified) {
                cmdArgs.push("--only-verified");
            }
            if (args.sinceCommit) {
                cmdArgs.push("--since-commit", args.sinceCommit);
            }
            if (args.includeDetectors) {
                cmdArgs.push("--include-detectors", args.includeDetectors.join(","));
            }
            if (args.excludeDetectors) {
                cmdArgs.push("--exclude-detectors", args.excludeDetectors.join(","));
            }
            const result = await executeTruffleHogScan(cmdArgs);
            if (result.exitCode !== 0 && result.stderr && !result.stdout) {
                return `Error scanning repository: ${result.stderr}`;
            }
            const findings = parseFindings(result.stdout);
            return formatFindings(findings);
        }
        case "scan_github_org": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            const org = args.org;
            const cmdArgs = ["github", "--org", org, "--json"];
            if (args.token) {
                cmdArgs.push("--token", args.token);
            }
            if (args.includeRepos) {
                cmdArgs.push("--include-repos", args.includeRepos.join(","));
            }
            if (args.excludeRepos) {
                cmdArgs.push("--exclude-repos", args.excludeRepos.join(","));
            }
            if (args.onlyVerified) {
                cmdArgs.push("--only-verified");
            }
            const result = await executeTruffleHogScan(cmdArgs);
            if (result.exitCode !== 0 && result.stderr && !result.stdout) {
                return `Error scanning GitHub organization: ${result.stderr}`;
            }
            const findings = parseFindings(result.stdout);
            return formatFindings(findings);
        }
        case "scan_filesystem": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            const scanPath = validatePath(args.path);
            const cmdArgs = ["filesystem", scanPath, "--json"];
            if (args.excludePaths) {
                for (const excludePath of args.excludePaths) {
                    cmdArgs.push("--exclude-paths", validatePath(excludePath));
                }
            }
            if (args.onlyVerified) {
                cmdArgs.push("--only-verified");
            }
            const result = await executeTruffleHogScan(cmdArgs);
            if (result.exitCode !== 0 && result.stderr && !result.stdout) {
                return `Error scanning filesystem: ${result.stderr}`;
            }
            const findings = parseFindings(result.stdout);
            return formatFindings(findings);
        }
        case "scan_s3_bucket": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            const bucket = args.bucket;
            const cmdArgs = ["s3", "--bucket", bucket, "--json"];
            if (args.prefix) {
                cmdArgs.push("--key", args.prefix);
            }
            if (args.onlyVerified) {
                cmdArgs.push("--only-verified");
            }
            const result = await executeTruffleHogScan(cmdArgs);
            if (result.exitCode !== 0 && result.stderr && !result.stdout) {
                return `Error scanning S3 bucket: ${result.stderr}`;
            }
            const findings = parseFindings(result.stdout);
            return formatFindings(findings);
        }
        case "scan_docker_image": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            const image = args.image;
            const cmdArgs = ["docker", "--image", image, "--json"];
            if (args.onlyVerified) {
                cmdArgs.push("--only-verified");
            }
            const result = await executeTruffleHogScan(cmdArgs);
            if (result.exitCode !== 0 && result.stderr && !result.stdout) {
                return `Error scanning Docker image: ${result.stderr}`;
            }
            const findings = parseFindings(result.stdout);
            return formatFindings(findings);
        }
        case "list_detectors": {
            // Common detector types supported by TruffleHog
            const detectors = [
                { name: "AWS", description: "AWS Access Keys and Secret Keys" },
                { name: "Azure", description: "Azure credentials and connection strings" },
                { name: "GCP", description: "Google Cloud Platform credentials" },
                { name: "GitHub", description: "GitHub personal access tokens and OAuth tokens" },
                { name: "GitLab", description: "GitLab tokens and credentials" },
                { name: "Slack", description: "Slack tokens and webhooks" },
                { name: "Stripe", description: "Stripe API keys" },
                { name: "Twilio", description: "Twilio API credentials" },
                { name: "SendGrid", description: "SendGrid API keys" },
                { name: "Mailchimp", description: "Mailchimp API keys" },
                { name: "HubSpot", description: "HubSpot API keys" },
                { name: "Datadog", description: "Datadog API and application keys" },
                { name: "PagerDuty", description: "PagerDuty API tokens" },
                { name: "Okta", description: "Okta API tokens" },
                { name: "Auth0", description: "Auth0 credentials" },
                { name: "Firebase", description: "Firebase credentials and tokens" },
                { name: "MongoDB", description: "MongoDB connection strings" },
                { name: "PostgreSQL", description: "PostgreSQL connection strings" },
                { name: "MySQL", description: "MySQL connection strings" },
                { name: "Redis", description: "Redis connection strings" },
                { name: "SSH", description: "SSH private keys" },
                { name: "JWT", description: "JSON Web Tokens" },
                { name: "Generic", description: "Generic high-entropy strings" },
            ];
            let output = `# TruffleHog Detectors

TruffleHog supports 800+ secret detectors. Here are some common ones:

| Detector | Description |
|----------|-------------|
`;
            for (const d of detectors) {
                output += `| ${d.name} | ${d.description} |\n`;
            }
            output += `
## Notes
- TruffleHog automatically verifies secrets against the respective service APIs
- Run \`trufflehog --help\` for a complete list of supported detectors
- Custom detectors can be configured via the configuration file
`;
            return output;
        }
        case "verify_secret": {
            if (!isTruffleHogInstalled()) {
                return "Error: TruffleHog CLI is not installed. Please install it first.";
            }
            // Create a temporary file with the secret for scanning
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `trufflehog-verify-${Date.now()}.txt`);
            try {
                fs.writeFileSync(tempFile, args.secret);
                const cmdArgs = [
                    "filesystem",
                    tempFile,
                    "--json",
                    "--include-detectors",
                    args.detectorType,
                ];
                const result = await executeTruffleHogScan(cmdArgs);
                // Clean up temp file
                fs.unlinkSync(tempFile);
                const findings = parseFindings(result.stdout);
                if (findings.length === 0) {
                    return `# Verification Result

No matching secrets found for detector type: ${args.detectorType}

This could mean:
- The secret format doesn't match the expected pattern
- The detector type is incorrect
- The secret is not recognized by TruffleHog
`;
                }
                const finding = findings[0];
                return `# Verification Result

- **Detector**: ${finding.DetectorName}
- **Verified**: ${finding.Verified ? "YES - Secret is ACTIVE" : "NO - Could not verify"}
- **Redacted**: ${finding.Redacted}

${finding.Verified
                    ? "**WARNING**: This secret is active and should be rotated immediately!"
                    : "The secret could not be verified. It may be inactive or the verification endpoint was unreachable."}
`;
            }
            catch (error) {
                // Clean up on error
                try {
                    fs.unlinkSync(tempFile);
                }
                catch {
                    // Ignore cleanup errors
                }
                return `Error verifying secret: ${error}`;
            }
        }
        case "generate_config": {
            const sources = args.sources;
            const notifiers = [];
            if (args.enableWebhook && args.webhookUrl) {
                notifiers.push({
                    type: "webhook",
                    config: {
                        url: args.webhookUrl,
                        token: config.webhookToken || undefined,
                    },
                });
            }
            const configContent = generateScannerConfig({
                sources,
                notifiers: notifiers.length > 0 ? notifiers : undefined,
            });
            if (args.outputPath) {
                try {
                    const validatedPath = validatePath(args.outputPath);
                    fs.writeFileSync(validatedPath, configContent);
                    return `Configuration file saved to: ${validatedPath}\n\n\`\`\`json\n${configContent}\n\`\`\``;
                }
                catch (error) {
                    return `Error saving configuration: ${error}`;
                }
            }
            return `# Generated TruffleHog Configuration

\`\`\`json
${configContent}
\`\`\`

## Usage

Save this configuration to a file (e.g., \`config.yaml\`) and run:

\`\`\`bash
trufflehog scan --config=config.yaml
\`\`\`

Or with Docker:

\`\`\`bash
docker run --net=host -v $(pwd)/config.yaml:/tmp/config.yaml \\
  us-docker.pkg.dev/thog-artifacts/public/scanner:latest \\
  scan --config=/tmp/config.yaml
\`\`\`
`;
        }
        case "analyze_finding": {
            const detectorType = args.detectorType;
            const verified = args.verified;
            const sourceType = args.sourceType;
            // Remediation guidance based on detector type
            const remediationGuides = {
                AWS: `
## AWS Credentials Remediation

1. **Immediate Actions**:
   - Disable the compromised access key in AWS IAM console
   - Create a new access key pair
   - Update all applications using the old credentials

2. **Investigation**:
   - Review CloudTrail logs for unauthorized access
   - Check for any resources created by the compromised key
   - Review IAM policies attached to the user/role

3. **Prevention**:
   - Use IAM roles instead of long-lived access keys
   - Enable MFA for all IAM users
   - Implement least-privilege access policies
`,
                GitHub: `
## GitHub Token Remediation

1. **Immediate Actions**:
   - Revoke the token in GitHub Settings > Developer Settings > Personal Access Tokens
   - Create a new token with minimal required scopes
   - Update all integrations using the old token

2. **Investigation**:
   - Review GitHub audit logs for unauthorized activity
   - Check for any unauthorized commits or changes
   - Review repository access logs

3. **Prevention**:
   - Use fine-grained personal access tokens
   - Set token expiration dates
   - Use GitHub Apps instead of personal tokens for integrations
`,
                Slack: `
## Slack Token Remediation

1. **Immediate Actions**:
   - Revoke the token in Slack Admin > Apps
   - Regenerate bot tokens if applicable
   - Update all integrations using the old token

2. **Investigation**:
   - Review Slack access logs
   - Check for any unauthorized messages or actions
   - Review app permissions

3. **Prevention**:
   - Use scoped OAuth tokens
   - Regularly rotate tokens
   - Monitor token usage with Slack audit logs
`,
                default: `
## General Secret Remediation

1. **Immediate Actions**:
   - Revoke or rotate the compromised credential
   - Update all applications using the credential
   - Monitor for unauthorized access

2. **Investigation**:
   - Review logs for any unauthorized activity
   - Determine the scope of potential exposure
   - Document the incident

3. **Prevention**:
   - Use secret managers (HashiCorp Vault, AWS Secrets Manager)
   - Implement secret rotation policies
   - Use pre-commit hooks to prevent secrets in code
`,
            };
            const guide = remediationGuides[detectorType] || remediationGuides.default;
            return `# Finding Analysis

## Summary
- **Secret Type**: ${detectorType}
- **Verified Active**: ${verified ? "YES - Immediate action required!" : "No / Unknown"}
- **Source**: ${sourceType || "Unknown"}

## Risk Assessment
${verified
                ? "**HIGH RISK**: This secret was verified as active. An attacker with access to this secret could potentially access your systems."
                : "**MEDIUM RISK**: This secret should be rotated as a precaution, even if verification failed."}

${guide}

## TruffleHog Enterprise Features

With TruffleHog Enterprise, you can:
- Automatically track secret remediation status
- Set up alerts for new findings
- Use TruffleHog Analyze to understand secret permissions
- Configure pre-commit hooks to prevent future leaks
`;
        }
        default:
            return `Unknown tool: ${name}`;
    }
}
// Main server setup
async function main() {
    const server = new Server({
        name: "trufflehog-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // Handle tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools };
    });
    // Handle tool execution
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await handleToolCall(name, (args || {}));
            return {
                content: [
                    {
                        type: "text",
                        text: result,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error executing tool ${name}: ${error}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("TruffleHog MCP Server started");
}
main().catch(console.error);
