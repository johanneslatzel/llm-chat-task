import { ToolPackage } from '@johannes.latzel/llm-chat';
import type { TaskPool } from '../pool.js';
import { CreateTaskTool } from '../tools/create-task.js';
import { ReadTaskTool } from '../tools/read-task.js';
import { UpdateTaskTool } from '../tools/update-task.js';

/** Bundles the task pool tools for registration. */
export class TaskToolPackage extends ToolPackage {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super([new CreateTaskTool(pool), new ReadTaskTool(pool), new UpdateTaskTool(pool)]);
        this.pool = pool;
    }

    tutorial(): string {
        const { maxTitleLength, maxAcceptanceCriteriaCount, maxAcceptanceCriteriaLength } =
            this.pool.config;
        return `## Tasks

Tasks are tracked in a single shared pool. Each task is a small, well-specified unit of
work: a short title (at most ${maxTitleLength} characters) plus structured fields that
form an embedded plan. Every task has a status and optionally depends on other tasks.

Status lifecycle:

- pending - has unfinished dependencies
- ready - no unfinished dependencies, not started
- in_progress - currently being worked on
- done - completed

pending and ready are derived automatically from dependencies.

Structured plan fields (all optional except title):

- description - the goal: what to do and why, current vs expected behavior
- acceptance_criteria - testable definition of done (at most ${maxAcceptanceCriteriaCount}
  items of ${maxAcceptanceCriteriaLength} characters each; use Given/When/Then or a checklist)
- steps - ordered execution plan
- context - relevant files, patterns, architectural decisions
- constraints - must-do / must-not-do guardrails
- out_of_scope - explicitly excluded work
- verification - commands or checks that confirm the work is done
- edge_cases - known pitfalls and edge conditions
- priority - low, medium or high
- type - feature, bug, refactor, chore or research
- links - reference URLs

Workflow:

1. create_task with a title and the plan fields that add value - returns a task id.
2. update_task(id, dependency_id) - order tasks. A task with an unfinished
   dependency becomes pending and can't be marked done.
3. update_task(id, status: in_progress) - start working on a task.
4. update_task(id, status: done, history: "...") - finish it, recording the outcome.
5. update_task(id, title|description|steps|...) - refine any structured field.
6. read_task(available: true) - list tasks that can be worked on right now.
7. read_task(status|priority|type) - filter listings by those fields.
8. read_task(id) - read a single task, including its full plan and progress log.
9. read_task() - list all tasks that are not done.

Tasks never throw: errors are returned as result strings.`;
    }
}
