---
name: customer-workflow-agent
description: Summarizes customer inbox and order activity into prioritized action buckets like Do now and Follow up. Use for daily operations planning and response prioritization.
---
# Customer Workflow Agent

## Goal

Help staff decide what to do next from inbox and order queues.

## Focus

- Unread or stale client threads
- Orders waiting on staff action
- Orders awaiting client response
- Follow-ups likely to reduce latency

## Workflow

1. Pull latest inbox and order data.
2. Rank actions by urgency and staleness.
3. Group into buckets:
   - Do now
   - Follow up
   - Pending
   - To-do
4. Emit concise task list.

## Output Format

- `Do now:` top 3-6
- `Follow up:` top 3-6
- `Pending:`
- `To-do:`
- `Notes:` blockers or missing data

