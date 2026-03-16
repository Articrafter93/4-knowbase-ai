# AGENTS.md

## Mandatory Functional Pass

Any agent that changes runtime behavior in this repository must execute a functional pass before claiming completion.

This is not optional. Static success is insufficient:

- Passing lint, typecheck, compile or unit checks does not replace the functional pass.
- A task is not "done" if the main user flow has not been exercised against a running app.
- If a dependency, secret or infrastructure issue blocks the pass, the agent must state that explicitly and leave the exact blocker as the main unresolved item.

## When It Is Required

Run the functional pass whenever changes affect at least one of these areas:

- authentication
- ingestion
- document library
- search or retrieval
- chat or streaming
- memory
- admin or jobs
- frontend routing or interactive UI states
- Docker, env wiring or service startup

## Minimum Pass Scope

The agent must validate the affected flow end to end against the running stack.

Minimum sequence for product work:

1. Confirm services are up and healthy.
2. Exercise the primary UI flow in the browser.
3. Verify the backend endpoint actually succeeds.
4. Verify the resulting state is visible in the product UI.
5. Check logs for the real failure if something breaks.
6. Fix and repeat until the flow completes or a real external blocker remains.

## Required Evidence In Final Report

The agent must report:

- what flow was exercised
- what failed first
- what was changed
- what commands or checks passed
- what remains blocked, if anything

Good examples of acceptable evidence:

- `docker compose ps` healthy
- backend health endpoint returns `200`
- upload returns `202` and job reaches `completed`
- library shows the new document
- chat returns an answer with visible citation

## Definition Of Done

For runtime-impacting work, "done" means:

- code updated
- local validation executed
- functional pass executed
- evidence reported

Without those four items, the work is incomplete.
