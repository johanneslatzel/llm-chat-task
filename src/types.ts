import { UUID } from 'crypto';

/** Lifecycle status of a task. `pending` and `ready` are derived from dependencies. */
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'done';

/** Stated importance of a task. Newly created tasks default to `low`; absence only occurs on tasks loaded from files stored before the default existed. */
export type TaskPriority = 'low' | 'medium' | 'high';

/** Kind of work a task represents. */
export type TaskType = 'feature' | 'bug' | 'refactor' | 'chore' | 'research';

/** The plan-carrying array fields on a task. */
export type PlanField =
    'steps' | 'constraints' | 'outOfScope' | 'verification' | 'context' | 'edgeCases';

/** A tracked unit of work with an embedded plan and optional dependencies on other tasks (referenced by id). */
export type Task = {
    id: UUID;
    /** Short, specific, imperative title. */
    title: string;
    /** Goal: what to do and why, including current vs expected behavior where relevant. */
    description?: string;
    /** Testable definition of done (checklist items or Given/When/Then scenarios). */
    acceptanceCriteria?: string[];
    /**
     * Optional identifier-style grouping label tying this task to a milestone
     * (e.g. "spiel-sdk-migration"): printable ASCII without whitespace.
     */
    milestone?: string;
    priority?: TaskPriority;
    type?: TaskType;
    /** Reference URLs (docs, issues, designs). */
    links?: string[];
    /** Ordered execution steps. */
    steps?: string[];
    /** Rules that must be followed (must-do / must-not-do). */
    constraints?: string[];
    /** Explicitly excluded work. */
    outOfScope?: string[];
    /** Commands or checks that confirm the work is complete. */
    verification?: string[];
    /** Relevant files, patterns, and architectural decisions not inferable from the code. */
    context?: string[];
    /** Known pitfalls and edge cases to watch for. */
    edgeCases?: string[];
    /** Append-only, timestamped progress log (newline-separated entries). */
    history: string;
    status: TaskStatus;
    dependencies: UUID[];
};
