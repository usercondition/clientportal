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

## Logical Operating Model

Use this routing so agents are predictable:

- **When code changes are in progress**
  - Run `qa-regression-agent` after meaningful edits.
  - Run `bug-triage-agent` immediately if any regression appears.
- **Before merge**
  - Run `pr-reviewer-agent`, then `release-readiness-agent`.
- **After deploy**
  - Run `ops-health-agent` to verify health and email delivery signals.
- **Daily operations**
  - Run `customer-workflow-agent` to produce priority buckets.
- **When updating visuals**
  - Run `content-asset-agent` before and after replacing assets.

## Trigger Matrix

- Chat/mobile behavior touched (`client-portal.js`, `admin-inbox.js`) -> `qa-regression-agent` + `pr-reviewer-agent`
- Email/contact/backend touched (`server.js`, `resin-home.js`) -> `qa-regression-agent` + `ops-health-agent`
- Gallery/hero assets or CSS touched (`assets/*`, `resin.css`) -> `content-asset-agent`
- Release candidate state -> `release-readiness-agent`

## Recommended Cadence

- Per PR: `qa-regression-agent`, `pr-reviewer-agent`
- Pre-push to main: `release-readiness-agent`
- Daily: `customer-workflow-agent`
- Post-release: `ops-health-agent`

