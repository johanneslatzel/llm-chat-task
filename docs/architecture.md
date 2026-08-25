# Architecture

## Overview

`llm-chat-task` provides an in-memory task pool with dependency tracking plus
the tools agents use to manage it. A task is a small, well-specified unit of
work: a short title plus structured fields that together form an embedded plan.
It follows the conventions shared across all `llm-chat` tool packages.

## Design

### Task model

Every task has a required short `title` and an optional set of structured plan
fields:

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `title` | string | Short, specific, imperative title. |
| `description` | string | The goal: what to do and why. |
| `acceptanceCriteria` | string[] | Testable definition of done. |
| `milestone` | string | Optional identifier-style grouping label tying the task to a milestone (e.g. `release-2026-q3`). |
| `priority` | enum | `low`, `medium` or `high`; newly created tasks default to `low`. |
| `type` | enum | `feature`, `bug`, `refactor`, `chore` or `research`. |
| `links` | string[] | Reference URLs. |
| `steps`, `constraints`, `outOfScope`, `verification`, `context`, `edgeCases` | string[] | The plan arrays: execution steps, guardrails, non-goals, verification commands, context, and known pitfalls. |

String-array items are trimmed and must be non-empty; links must be valid URLs.
Milestones are trimmed too; an empty or whitespace-only value means "no
milestone", so passing `''` to `updateTask` clears the field. A non-empty
milestone is identifier-style: it must contain no whitespace characters and
consist of printable ASCII only (code points 0x20-0x7E).
The plan arrays mirror the guidance from LLM-agent task-spec literature: state
the goal, provide context and constraints, define done, and call out edge cases.

### Task status

Every task has a `status` with one of four values:

| Status | Meaning |
| ------ | ------- |
| `pending` | has at least one unfinished dependency |
| `ready` | no unfinished dependencies, not started |
| `in_progress` | currently being worked on |
| `done` | completed |

`pending` and `ready` are derived from dependencies and cannot be set directly:
creating a task makes it `ready`; adding an unfinished dependency demotes it to
`pending`; once all its dependencies are `done` it returns to `ready`
automatically. Only `ready`, `in_progress` and `done` can be set via `updateTask`.

### Configuration

The task limits live in a `TaskConfiguration`, which `TaskPool` takes as an
optional constructor argument (defaulting to a fresh instance). Each limit is
resolved at construction time: an explicit option wins, then a
`LLM_CHAT_TASK_*` environment variable, then the `DEFAULT_*` constant. All
values are clamped to a minimum of 1.

| Field | Default | Env var |
| ----- | ------- | ------- |
| `maxTitleLength` | 100 | `LLM_CHAT_TASK_MAX_TITLE_LENGTH` |
| `maxDescriptionLength` | 500 | `LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH` |
| `maxMilestoneLength` | 64 | `LLM_CHAT_TASK_MAX_MILESTONE_LENGTH` |
| `maxAcceptanceCriteriaCount` | 10 | `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT` |
| `maxAcceptanceCriteriaLength` | 200 | `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH` |
| `maxLinksPerTask` | 20 | `LLM_CHAT_TASK_MAX_LINKS_PER_TASK` |
| `maxPlanFieldCount` | 20 | `LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT` |
| `maxPlanFieldLength` | 300 | `LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH` |
| `maxHistoryLength` | 10,000 | `LLM_CHAT_TASK_MAX_HISTORY_LENGTH` |
| `historyPreviewLength` | 200 | `LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH` |

The configuration is captured by the pool, the three tool classes, and the
package tutorial at construction, so a pool enforces its limits consistently
for its whole lifetime. Invalid env values (empty, non-numeric, too small)
fall back to the default (or clamp to 1).

### TaskPool

`TaskPool` is an in-memory `Record<id, Task>` guarded by an `async-mutex`:

- `createTask(input)`: validates and creates a `ready` task from a
  `CreateTaskInput` (`title` required), returning its `UUID`; an omitted
  priority defaults to `low` (loading a file never applies the default)
- `getTask(id)`: returns a task by id, or `undefined`
- `resolveId(idOrPrefix)`: resolves a full id or a unique prefix of at least
  `MIN_ID_PREFIX_LENGTH` characters (default 8) to a task; exact matches win,
  ambiguous prefixes report all candidate ids, shorter input reports `too-short`
- `getTasks()`: all tasks
- `getAvailableTasks()`: tasks that are not done and whose dependencies are all finished
- `getUnfinishedDependencyIds(taskId)`: the dependency ids of a task that still block it
- `updateTask(id, changes)`: sets a status (`ready`/`in_progress`/`done`),
  refines any structured field, appends a timestamped entry to the progress
  log, and/or adds a dependency; rejects missing ids, self-dependencies,
  duplicate dependencies, and any cycle, and refuses new dependencies on tasks
  that are `in_progress` or `done`
- `clear()`: resets the pool
- `save(path)` / `loadFromFile(path)` / `TaskPool.load(path)`: optional file persistence

Tasks reference their dependencies by id, so a single `Task` never carries the
whole dependency tree and task lists serialize cleanly. Dangling dependency ids
in a hand-edited file are pruned on load. Files carry the `status` field; a file
with an invalid or missing status is rejected on load. `updateTask` refuses a
task depending on itself, and a BFS over the dependency graph rejects any other
cycle before the edge is added.

Titles are normalized (trimmed) and validated on create, update, and load:
non-empty and at most `maxTitleLength` (default 100) characters. Descriptions
must be non-empty and at most `maxDescriptionLength`. All structured fields are
validated the same way on create, update, and load: enum membership, URL
validity for links, and count + item-length limits for arrays. `history` is an
append-only progress log: every `updateTask(..., { history })` call prepends an
ISO timestamp and appends the entry, and appends beyond `maxHistoryLength`
(default 10,000) are rejected. All `updateTask` validation runs before any field
is mutated, so a rejected update never leaves a task half-changed. Task listings
preview long text fields at `historyPreviewLength` (default 200) characters;
single-task reads return full fields.

### Tool classes

Each tool extends `Tool` from `@johannes.latzel/llm-chat`:

1. Constructor calls `super(name, description, params)` with a `ToolParameters` instance
2. `onExecute()` validates parameters (`typeof` guards), performs the operation, and returns `PartialToolResult`
3. All errors are caught and returned as plain-string messages; tools never throw

The tool descriptions double as usage coaching: `create_task` explains how to
fill each structured field productively, and `update_task` reminds the caller to
record a completion summary when marking a task done.

### Package classes

The `ToolPackage` abstract class (from `@johannes.latzel/llm-chat`) groups related tools for registration:

```typescript
abstract class ToolPackage {
    tools(): Tool[];
}
```

`TaskToolPackage` extends `ToolPackage` and bundles the three task tools around a shared `TaskPool`.

| Class | Tools | Constructor |
| ----- | ----- | ----------- |
| `TaskToolPackage` | create_task, read_task, update_task | required `TaskPool` |

## Tools

| Tool | Description |
| ---- | ----------- |
| `create_task` | Create a task from a `title` plus optional structured fields: description, milestone, acceptance_criteria, priority, type, links, and the six plan arrays. All values validated against the configured limits. |
| `read_task` | Read a task by id (full structured fields and progress log; shortened ids of at least 8 characters accepted when unique), list all tasks that are not done, list available tasks (`available` flag), filter listings by `status`, `priority`, `type` or exact `milestone`, and search task fields with a case-insensitive JavaScript regex (`query` + optional `strict` flag), with matches annotated via `matchedFields`. Listings preview long text fields at `historyPreviewLength`. |
| `update_task` | Set a task status, refine any structured field (title, description, milestone — empty string clears it, priority, type, and the array fields; arrays replace the whole list), append a progress-log entry, and/or add a dependency. Accepts shortened ids for both `id` and `dependency_id`. |

## Dependencies

- `llm-chat`: framework providing `Tool`, `ToolParameters`, etc.
- `async-mutex`: serializes pool mutations
