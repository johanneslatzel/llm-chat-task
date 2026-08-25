# API Reference

## Common patterns

All tools return a `PartialToolResult` with shape:

```typescript
{
    status: ResultStatus.Success | ResultStatus.Error;
    result: string; // result on success, error message on failure
    tool: string; // tool name, e.g. "create_task"
}
```

## TaskPool

In-memory task pool. Each task has an id, a required short `title`, optional
structured plan fields, an append-only `history` progress log, a `status`
(`pending` | `ready` | `in_progress` | `done`), and dependencies on other tasks
(referenced by id).

A task carries the following fields:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `title` | string (required) | Short, specific, imperative title. Non-empty, at most `maxTitleLength` (default 100). |
| `description` | string (optional) | The goal: what to do and why. At most `maxDescriptionLength` (default 500). |
| `milestone` | string (optional) | Identifier-style grouping label, e.g. `release-2026-q3`. Printable ASCII without whitespace, at most `maxMilestoneLength` (default 64); empty or whitespace-only stores no milestone. |
| `acceptanceCriteria` | string[] (optional) | Testable definition of done. At most `maxAcceptanceCriteriaCount` (default 10) items of `maxAcceptanceCriteriaLength` (default 200) characters each. |
| `priority` | `low \| medium \| high` (optional) | Stated importance. `createTask` defaults it to `low` when omitted; absence only occurs on tasks loaded from files stored before the default existed. |
| `type` | `feature \| bug \| refactor \| chore \| research` (optional) | Kind of work. |
| `links` | string[] (optional) | Reference URLs. At most `maxLinksPerTask` (default 20), each a valid URL. |
| `steps` | string[] (optional) | Ordered execution plan. |
| `constraints` | string[] (optional) | Must-do / must-not-do guardrails. |
| `outOfScope` | string[] (optional) | Explicitly excluded work. |
| `verification` | string[] (optional) | Commands or checks that confirm completion. |
| `context` | string[] (optional) | Relevant files, patterns, architectural decisions. |
| `edgeCases` | string[] (optional) | Known pitfalls and edge conditions. |

The six plan arrays (`steps`, `constraints`, `outOfScope`, `verification`,
`context`, `edgeCases`) share limits: at most `maxPlanFieldCount` (default 20)
items of `maxPlanFieldLength` (default 300) characters each. All string-array
items are trimmed and must be non-empty.

```typescript
import { TaskPool } from '@johannes.latzel/llm-chat-task';

const pool = new TaskPool();
const id = await pool.createTask({
    title: 'Add phone validation to UserService',
    description: 'Reject malformed phone numbers at the service layer.',
    acceptanceCriteria: ['Valid E.164 numbers pass', 'Invalid numbers return an error'],
    priority: 'high',
    type: 'feature',
    steps: ['Add ValidatePhone', 'Add table-driven tests', 'Run npm run verify'],
    verification: ['npm run verify']
});
await pool.updateTask(id, { status: 'done', history: 'Result data' });
await pool.save('./tasks.json');
```

### `TaskConfiguration`

Controls the task limits. Explicit options win; otherwise `LLM_CHAT_TASK_*`
environment variables are used; otherwise the defaults. Values are clamped to
a minimum of 1.

```typescript
import { TaskPool, TaskConfiguration } from '@johannes.latzel/llm-chat-task';

const pool = new TaskPool(new TaskConfiguration({ maxTitleLength: 80 }));
```

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

The environment variables are read when the configuration is constructed, so
the same `TaskPool` enforces its limits consistently for its whole lifetime.

### `createTask(input)`

Creates a task from a `CreateTaskInput` (`title` required; all other fields
optional) and returns its `UUID`. Descriptions, titles, and array items are
trimmed; invalid enums, URLs, empty items, and over-long values are rejected.
An omitted `priority` defaults to `low`.

### `updateTask(id, changes)`

`changes` may contain any of:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `status` | `'ready' \| 'in_progress' \| 'done'` | Sets the task status. `pending` is derived and rejected. Setting a status while dependencies are unfinished is rejected. |
| `history` | string | Appends a timestamped entry (`[<ISO timestamp>] <text>`) to the task's progress log. Entries accumulate newline-separated; appending beyond the `maxHistoryLength` cap is rejected and the log is left unchanged. |
| `addDependency` | string | Id of a task to add as a dependency. Rejects missing ids, self-dependencies, duplicates, cycles, and any dependency on a task that is `in_progress` or `done`; unfinished dependencies set the task to `pending`. |
| `title` | string | Replaces the title. Must be non-empty and at most `maxTitleLength`. |
| `description` | string | Replaces the description. Must be non-empty and at most `maxDescriptionLength`. |
| `milestone` | string | Replaces the milestone (printable ASCII without whitespace, at most `maxMilestoneLength`); empty or whitespace-only clears it. |
| `acceptanceCriteria` | string[] | Replaces the whole array (validated like create). |
| `priority` / `type` | enum | Replaces the value. |
| `links` | string[] | Replaces the whole array (validated like create). |
| `steps`, `constraints`, `outOfScope`, `verification`, `context`, `edgeCases` | string[] | Replace the whole array (validated like create). |

All validation happens before any change is applied; a rejected update never
partially modifies the task.

## create_task

Creates a task with a structured description, acceptance criteria, and an
embedded plan. The tool description coaches the caller on how to fill each
field productively.

**Tool name:** `create_task`

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `title` | string | yes | Short, specific, imperative title. At most `maxTitleLength` (default 100). |
| `description` | string | no | What to do and why; current vs expected behavior where relevant. At most `maxDescriptionLength` (default 500). |
| `milestone` | string | no | Identifier-style grouping label, e.g. `release-2026-q3`. Printable ASCII without whitespace, at most `maxMilestoneLength` (default 64); empty or whitespace-only stores no milestone. |
| `acceptance_criteria` | string[] | no | Testable definition of done (Given/When/Then or checklist). At most 10 items of 200 characters. |
| `steps` | string[] | no | Ordered execution plan. |
| `context` | string[] | no | Relevant files, patterns, architectural decisions. |
| `constraints` | string[] | no | Must-do / must-not-do guardrails. |
| `out_of_scope` | string[] | no | Explicitly excluded work. |
| `verification` | string[] | no | Commands or checks that confirm the work is done. |
| `edge_cases` | string[] | no | Known pitfalls and edge conditions. |
| `priority` | string | no | `low`, `medium` or `high`. Defaults to low when omitted. |
| `type` | string | no | `feature`, `bug`, `refactor`, `chore` or `research`. |
| `links` | string[] | no | Reference URLs. At most 20, each a valid URL. |

**Returns:** `"Task created with id: <id>"`

## read_task

Reads tasks. Pass an `id` to read a single task (full structured fields and
progress log), set `available` to list tasks that can be worked on right now,
pass `query` to search task fields with a regex, or omit all three to list all
tasks that are not done.

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | string | no | The id of the task to read. A shortened id of at least `MIN_ID_PREFIX_LENGTH` (default 8) characters is accepted when it matches exactly one task; an exact full-id match always wins. Ambiguous prefixes are rejected with the list of matching ids. Mutually exclusive with `available` and `query`. |
| `query` | string | no | JavaScript regex matched case-insensitively against title, description, id, history and every string-array item. Mutually exclusive with `id`; composes with `available`, `status`, `priority` and `type`. A whitespace-only query is ignored. |
| `strict` | boolean | no | When true (default), `query` is compiled with the Unicode `u` flag, which rejects legacy escape sequences like `\"`. Set false to allow such escapes (the pattern is then compiled with only the `i` flag). |
| `available` | boolean | no | When true, list only tasks with no unfinished dependencies that are not done. Mutually exclusive with `id`. |
| `status` | string | no | Filter listings by status (`pending`, `ready`, `in_progress`, `done`). |
| `priority` | string | no | Filter listings by priority (`low`, `medium`, `high`). |
| `type` | string | no | Filter listings by type (`feature`, `bug`, `refactor`, `chore`, `research`). |
| `milestone` | string | no | Filter listings by exact milestone (compared after trimming); a value no task has yields an empty listing. Composes with the other filters. |

**Returns:** JSON. With `id`: the task with all fields plus `unfinishedDependencies`
(short ids resolve to the full task). Without: a JSON array of the same objects,
but long text fields (including `history` and each string-array item) are
truncated to a `historyPreviewLength`-character preview (default 200, suffix
`...`). When `query` is active, each match carries `matchedFields` naming the
fields that matched, e.g. `["title", "steps[2]"]`, and non-matching tasks are
omitted. Invalid regexes, unknown ids, too-short ids and ambiguous prefixes
return an error.

## update_task

Updates a task: sets its status, refines any structured field, appends to its
progress log, and/or adds a dependency. The tool description instructs the
caller to record a completion summary in `history` when marking a task done.

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `id` | string | yes | The id of the task to update. A shortened id of at least 8 characters is accepted when it matches exactly one task; success messages echo the resolved full UUID. |
| `status` | string | no | `ready`, `in_progress` or `done`. `pending` is derived automatically. Mutually exclusive with `dependency_id`. |
| `history` | string | no | Appends a timestamped entry to the task's progress log (capped at `maxHistoryLength` characters, default 10,000). |
| `dependency_id` | string | no | The id of a task this task should depend on; shortened ids are accepted like `id`. Mutually exclusive with `status`. |
| `title` | string | no | New title (non-empty, at most `maxTitleLength`). |
| `description` | string | no | New description (non-empty, at most `maxDescriptionLength`). |
| `milestone` | string | no | New identifier-style milestone label (printable ASCII without whitespace, at most `maxMilestoneLength`); an empty string clears the milestone. |
| `acceptance_criteria` | string[] | no | New acceptance criteria list; replaces the whole array. |
| `steps` | string[] | no | New steps list; replaces the whole array. |
| `context` | string[] | no | New context list; replaces the whole array. |
| `constraints` | string[] | no | New constraints list; replaces the whole array. |
| `out_of_scope` | string[] | no | New out-of-scope list; replaces the whole array. |
| `verification` | string[] | no | New verification list; replaces the whole array. |
| `edge_cases` | string[] | no | New edge-cases list; replaces the whole array. |
| `priority` | string | no | New priority (`low`, `medium`, `high`). |
| `type` | string | no | New type (`feature`, `bug`, `refactor`, `chore`, `research`). |
| `links` | string[] | no | New links list; replaces the whole array. |

**Returns:** `"Task updated with id: <id>, status: <status>"`, extended with a
per-updated-field suffix (e.g. `", title updated"`, `", progress entry
recorded"`, `", now depends on <id>"`). `<id>` is always the resolved full
UUID, even when a shortened id was passed. Errors on unknown ids, too-short
ids, ambiguous prefixes, invalid statuses, invalid field values, or dependency
problems.

### `resolveId(idOrPrefix)`

Resolves a full task id or a shortened prefix of one. An exact id match always
wins. Otherwise input of at least `MIN_ID_PREFIX_LENGTH` characters is matched
case-insensitively against the canonical ids: a unique match returns
`{ kind: 'prefix', task }`, several matches return
`{ kind: 'ambiguous', candidates }` with all matching UUIDs in insertion order,
and no match returns `{ kind: 'not-found' }`. Shorter input yields
`{ kind: 'too-short' }`. Both `read_task` and `update_task` use this, so agents
can pass the 8-character prefixes commonly copied from listings.

---

## Package classes

### TaskToolPackage

Groups all three task tools around a shared `TaskPool`.

```typescript
import { TaskPool, TaskToolPackage } from '@johannes.latzel/llm-chat-task';
const pkg = new TaskToolPackage(new TaskPool());
service.tools().add(pkg);
```

- **Tools:** create_task, read_task, update_task (3 tools)
- **Constructor:** required `TaskPool`
