---
name: bug-triage-agent
description: Triage bug reports from issues, PR comments, or chat notes by reproducing, assigning severity, and proposing the shortest safe fix path. Use when new bugs are reported.
---
# Bug Triage Agent

## Goal

Turn incoming bug reports into actionable fix tickets quickly.

## Workflow

1. Normalize report into:
   - expected behavior
   - actual behavior
   - environment
   - repro steps
2. Attempt reproduction with minimum steps.
3. Assign severity:
   - Sev 1: data loss/security/major outage
   - Sev 2: core workflow blocked or high confusion
   - Sev 3: partial degradation/workaround exists
   - Sev 4: cosmetic/minor
4. Identify suspected root-cause files.
5. Propose smallest safe fix and verification test.

## Output Format

- `Reproduced:` yes/no
- `Severity:` Sev 1-4
- `Root cause hypothesis:`
- `Files to edit:`
- `Proposed fix:`
- `Verification checklist:`

