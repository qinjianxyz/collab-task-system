# Security Policy

## Supported Versions

The `main` branch is the supported release line for this project.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

Preferred path:

1. Use GitHub private vulnerability reporting for the repository if it is enabled.
2. If private reporting is unavailable, contact the maintainer privately through GitHub.

Please include:

- affected version or commit
- reproduction steps
- impact assessment
- any suggested remediation

I will acknowledge receipt as quickly as possible, validate the report, and coordinate a fix before public disclosure when appropriate.

## Scope

Examples of issues that belong here:

- auth or identity bypasses
- event append authorization flaws
- SSE data leakage across projects
- injection, deserialization, or secrets exposure
- rate-limit or backpressure bypasses that create meaningful abuse paths
