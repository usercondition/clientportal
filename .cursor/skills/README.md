# Project Agent Skills

This folder contains reusable project-level skills for recurring agent workflows in this repo.

## Available Skills

- `qa-regression-agent`
- `pr-reviewer-agent`
- `bug-triage-agent`
- `release-readiness-agent`
- `content-asset-agent`
- `ops-health-agent`
- `customer-workflow-agent`

## Where To See What Agents Did

- Cloud runs and outputs: [https://cursor.com/agents](https://cursor.com/agents)
- Cloud run settings, spend, secrets, MCP: [https://cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents)
- Local/subagent activity in-editor: agent chat thread and tool call history
- Git work produced by agents: commit history and pull requests

## Suggested Pattern

For each release cycle:

1. Run `qa-regression-agent`
2. Run `pr-reviewer-agent`
3. Run `release-readiness-agent`
4. If failures are found, run `bug-triage-agent`

