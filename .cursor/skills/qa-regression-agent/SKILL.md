---
name: qa-regression-agent
description: Runs regression smoke tests for chat, contact form, and notification flows. Use when validating a push, pre-release check, or after bug fixes touching client/admin messaging.
---
# QA Regression Agent

## Goal

Catch regressions fast in core customer flows for this project.

## Scope

- Client mobile chat open/close/send/scroll behavior
- Admin inbox send/reply flow
- Contact form submit flow
- Notification/error states for transient failures

## Workflow

1. Identify changed files and impacted features.
2. Run quick static checks first (`node --check`, lint if available).
3. Execute manual smoke scenarios:
   - Client sends message with and without attachment
   - Admin replies once and rapid-click attempts do not duplicate
   - Temporary offline simulation does not clear previously loaded threads/messages
   - Contact form validates and submits expected payload
4. Record pass/fail per scenario.
5. If failure occurs, include repro steps and likely root cause file.

## Output Format

Return:

- `Status:` pass/fail
- `Checked:` bullet list of scenarios
- `Failures:` exact repro steps
- `Suspect files:` concrete paths
- `Fix recommendation:` one short action per failure

