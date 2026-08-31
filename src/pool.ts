import { Mutex } from 'async-mutex';
import { randomUUID, UUID } from 'crypto';
import type { ObjectStore } from '@johannes.latzel/json-file-store';
import { JsonFileStore, MemoryStore } from '@johannes.latzel/json-file-store';
import { MIN_ID_PREFIX_LENGTH } from './constants.js';
import { PLAN_FIELDS, PRIORITIES, STATUSES, TYPES } from './lib/fields.js';
import { TaskConfiguration } from './lib/config.js';
import { PlanField, Task, TaskPriority, TaskStatus, TaskType } from './types.js';

export type { Task, TaskStatus, TaskPriority, TaskType, PlanField };

/** Outcome of resolving a task id or id prefix via `TaskPool.resolveId`. */
export type IdResolution =
    | { kind: 'exact'; task: Task }
    | { kind: 'prefix'; task: Task }
    | { kind: 'ambiguous'; candidates: UUID[] }
    | { kind: 'too-short' }
    | { kind: 'not-found' };

/** Input for creating a task via `TaskPool.createTask`. */
export type CreateTaskInput = {
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
    /**
     * Optional identifier-style grouping label: printable ASCII without
     * whitespace; trimmed, empty/whitespace stores no milestone.
     */
    milestone?: string;
    priority?: TaskPriority;
    type?: TaskType;
    links?: string[];
    steps?: string[];
    constraints?: string[];
    outOfScope?: string[];
    verification?: string[];
    context?: string[];
    edgeCases?: string[];
};

/** Changes applied to a task by `TaskPool.updateTask`. */
export type UpdateTaskInput = {
    status?: TaskStatus;
    history?: string;
    addDependency?: string;
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
    /**
     * New milestone label (printable ASCII, no whitespace).
     * Empty or whitespace-only clears the task's milestone.
     */
    milestone?: string;
    priority?: TaskPriority;
    type?: TaskType;
    links?: string[];
    steps?: string[];
    constraints?: string[];
    outOfScope?: string[];
    verification?: string[];
    context?: string[];
    edgeCases?: string[];
};

function isTaskStatus(value: unknown): value is TaskStatus {
    return (STATUSES as readonly unknown[]).includes(value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
    return (PRIORITIES as readonly unknown[]).includes(value);
}

function isTaskType(value: unknown): value is TaskType {
    return (TYPES as readonly unknown[]).includes(value);
}

function normalizeText(text: string): string {
    return text.trim();
}

function validateNonEmpty(text: string, label: string): void {
    if (text.length === 0) {
        throw new Error(label + ' must not be empty');
    }
}

function validateMaxLength(text: string, maxLength: number, label: string): void {
    if (text.length > maxLength) {
        throw new Error(
            label + ' must be at most ' + maxLength + ' characters (got ' + text.length + ')'
        );
    }
}

function validateTitle(title: string, maxLength: number): void {
    validateNonEmpty(title, 'Title');
    validateMaxLength(title, maxLength, 'Title');
}

function validateTextList(list: unknown, maxCount: number, maxLength: number, label: string): void {
    if (list === undefined) {
        return;
    }
    if (!Array.isArray(list)) {
        throw new Error(label + ' must be an array of strings');
    }
    if (list.length > maxCount) {
        throw new Error(
            label + ' must have at most ' + maxCount + ' items (got ' + list.length + ')'
        );
    }
    for (const item of list) {
        if (typeof item !== 'string') {
            throw new Error(label + ' items must be strings');
        }
        const normalized = normalizeText(item);
        validateNonEmpty(normalized, label + ' items');
        validateMaxLength(normalized, maxLength, label + ' items');
    }
}

function validateLinks(list: unknown, maxCount: number): void {
    if (list === undefined) {
        return;
    }
    if (!Array.isArray(list)) {
        throw new Error('Links must be an array of strings');
    }
    if (list.length > maxCount) {
        throw new Error('Links must have at most ' + maxCount + ' items (got ' + list.length + ')');
    }
    for (const item of list) {
        if (typeof item !== 'string') {
            throw new Error('Links items must be strings');
        }
        const normalized = normalizeText(item);
        validateNonEmpty(normalized, 'Links items');
        try {
            new URL(normalized);
        } catch {
            throw new Error('Links items must be valid URLs: ' + normalized);
        }
    }
}

function validateDescription(value: unknown, maxLength: number): void {
    if (value === undefined) {
        return;
    }
    if (typeof value !== 'string') {
        throw new Error('Description must be a string');
    }
    const description = normalizeText(value);
    validateNonEmpty(description, 'Description');
    validateMaxLength(description, maxLength, 'Description');
}

/**
 * Validates a milestone value: `undefined` is ignored; empty or whitespace-only
 * is valid and means "no milestone" (clearing on update); otherwise the trimmed
 * value must contain no whitespace characters, consist of printable ASCII only
 * (code points 0x20-0x7E) and be at most `maxLength` characters long.
 */
function validateMilestone(value: unknown, maxLength: number): void {
    if (value === undefined) {
        return;
    }
    if (typeof value !== 'string') {
        throw new Error('Milestone must be a string');
    }
    const milestone = normalizeText(value);
    if (/\s/.test(milestone)) {
        throw new Error('Milestone must not contain whitespace');
    }
    if (/[^\x20-\x7E]/.test(milestone)) {
        throw new Error('Milestone must contain only ASCII characters');
    }
    validateMaxLength(milestone, maxLength, 'Milestone');
}

function validatePriority(value: unknown): void {
    if (value !== undefined && !isTaskPriority(value)) {
        throw new Error(
            "Invalid priority '" + value + "'. Allowed values: " + PRIORITIES.join(', ')
        );
    }
}

function validateType(value: unknown): void {
    if (value !== undefined && !isTaskType(value)) {
        throw new Error("Invalid type '" + value + "'. Allowed values: " + TYPES.join(', '));
    }
}

/** Structured input accepted by the validators; `undefined` fields are ignored. */
type StructuredInput = {
    title: string;
    description?: string | undefined;
    milestone?: string | undefined;
    acceptanceCriteria?: string[] | undefined;
    priority?: TaskPriority | undefined;
    type?: TaskType | undefined;
    links?: string[] | undefined;
    steps?: string[] | undefined;
    constraints?: string[] | undefined;
    outOfScope?: string[] | undefined;
    verification?: string[] | undefined;
    context?: string[] | undefined;
    edgeCases?: string[] | undefined;
};

/** Validates all structured input fields. Undefined fields are ignored. */
function validateStructuredInput(input: StructuredInput, config: TaskConfiguration): void {
    const title = normalizeText(input.title);
    validateTitle(title, config.maxTitleLength);
    validateDescription(input.description, config.maxDescriptionLength);
    validateMilestone(input.milestone, config.maxMilestoneLength);
    validateTextList(
        input.acceptanceCriteria,
        config.maxAcceptanceCriteriaCount,
        config.maxAcceptanceCriteriaLength,
        'Acceptance criteria'
    );
    validatePriority(input.priority);
    validateType(input.type);
    validateLinks(input.links, config.maxLinksPerTask);
    for (const field of PLAN_FIELDS) {
        validateTextList(
            input[field],
            config.maxPlanFieldCount,
            config.maxPlanFieldLength,
            fieldLabel(field)
        );
    }
}

/** Human label for a plan field, e.g. `outOfScope` -> `Out of scope`. */
function fieldLabel(field: PlanField): string {
    const withSpaces = field
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/** Formats a progress-log entry with its timestamp. */
function formatLogEntry(entry: string): string {
    return '[' + new Date().toISOString() + '] ' + entry;
}

/** Optional structured fields that can be copied from a source onto a task. */
type FieldSource = Pick<
    CreateTaskInput,
    'description' | 'milestone' | 'priority' | 'type' | 'acceptanceCriteria' | 'links' | PlanField
>;

/** Copies the optional string-array fields from a source onto a task, normalizing each item. */
function copyNormalizedArrays(source: FieldSource, target: Task): void {
    if (source.acceptanceCriteria !== undefined) {
        target.acceptanceCriteria = source.acceptanceCriteria.map(normalizeText);
    }
    if (source.links !== undefined) {
        target.links = source.links.map(normalizeText);
    }
    for (const field of PLAN_FIELDS) {
        if (source[field] !== undefined) {
            target[field] = source[field].map(normalizeText);
        }
    }
}

/** Copies the optional structured fields from a source onto a task, normalizing text fields. */
function copyStructuredFields(source: FieldSource, target: Task): void {
    if (source.description !== undefined) {
        target.description = normalizeText(source.description);
    }
    if (source.milestone !== undefined) {
        const milestone = normalizeText(source.milestone);
        if (milestone === '') {
            delete target.milestone;
        } else {
            target.milestone = milestone;
        }
    }
    if (source.priority !== undefined) {
        target.priority = source.priority;
    }
    if (source.type !== undefined) {
        target.type = source.type;
    }
    copyNormalizedArrays(source, target);
}

/** Validates a stored task's core fields (`status`, `title`, `history`) and structured inputs. */
function validateTask(task: Task, config: TaskConfiguration): void {
    if (!isTaskStatus(task.status)) {
        throw new Error('Invalid task status in store: ' + String(task.status));
    }
    if (typeof task.title !== 'string') {
        throw new Error('Invalid task title in store');
    }
    validateStructuredInput(
        {
            title: task.title,
            description: task.description,
            milestone: task.milestone,
            acceptanceCriteria: task.acceptanceCriteria,
            priority: task.priority,
            type: task.type,
            links: task.links,
            steps: task.steps,
            constraints: task.constraints,
            outOfScope: task.outOfScope,
            verification: task.verification,
            context: task.context,
            edgeCases: task.edgeCases
        },
        config
    );
    if (typeof task.history !== 'string') {
        throw new Error('Invalid task history in store');
    }
}

/**
 * Task pool with dependency tracking and a backing {@link ObjectStore}.
 *
 * Create pools via {@link TaskPool.create}: without a configured `dir` the
 * pool is backed by a fresh in-memory store; with `dir` it is backed by a
 * `JsonFileStore` on that directory and pre-loaded from any stored tasks.
 */
export class TaskPool {
    /** Limits enforced by this pool; fixed at construction. */
    readonly config: TaskConfiguration;
    private readonly tasks: Record<string, Task> = {};
    private readonly mutex: Mutex = new Mutex();
    private readonly storeRef: ObjectStore<Task>;

    private constructor(config: TaskConfiguration, store: ObjectStore<Task>) {
        this.config = config;
        this.storeRef = store;
    }

    /**
     * Creates a task pool. Without a configured `dir` the pool is backed by
     * a fresh in-memory store. With `dir` (option or `LLM_CHAT_TASK_DIR` env
     * var) the pool is backed by a `JsonFileStore` on that directory and
     * loads any stored tasks, validating each strictly and re-establishing
     * dependency references (dangling dependency ids are pruned). Later
     * writes persist back into the store.
     *
     * @param config Pool configuration (persistence directory and limits);
     * defaults to a fresh {@link TaskConfiguration}.
     */
    static async create(config?: TaskConfiguration): Promise<TaskPool> {
        const resolved = config ?? new TaskConfiguration();
        const store = resolved.dir
            ? new JsonFileStore<Task>({ dir: resolved.dir })
            : new MemoryStore<Task>();
        const pool = new TaskPool(resolved, store);
        if (resolved.dir) {
            await pool.loadFromStore();
        }
        return pool;
    }

    private async loadFromStore(): Promise<void> {
        const stored = await this.storeRef.entries();
        await this.mutex.runExclusive(() => {
            for (const task of stored) {
                validateTask(task, this.config);
            }
            this.clearMap();
            const byId: Record<string, Task> = {};
            for (const task of stored) {
                const copy: Task = {
                    id: task.id,
                    title: normalizeText(task.title),
                    history: task.history,
                    status: task.status,
                    dependencies: []
                };
                copyStructuredFields(task, copy);
                byId[copy.id] = copy;
                this.tasks[copy.id] = copy;
            }
            for (const task of stored) {
                const copy = byId[task.id]!;
                for (const depId of task.dependencies) {
                    if (byId[depId]) {
                        copy.dependencies.push(depId);
                    }
                }
            }
        });
    }

    /** Creates a task from the given structured input and returns its id. */
    async createTask(input: CreateTaskInput): Promise<UUID> {
        validateStructuredInput(input, this.config);
        const task: Task = {
            id: randomUUID(),
            title: normalizeText(input.title),
            status: 'ready',
            history: '',
            dependencies: []
        };
        copyStructuredFields(input, task);
        if (input.priority === undefined) {
            task.priority = 'low';
        }
        await this.mutex.runExclusive(async () => {
            this.tasks[task.id] = task;
            await this.storeRef.set(task);
        });
        return task.id;
    }

    /** Returns a task by id, or `undefined` when it does not exist. */
    getTask(id: string): Task | undefined {
        return this.tasks[id];
    }

    /**
     * Resolves a full task id or a shortened prefix of one. An exact id match
     * always wins, even for inputs shorter than {@link MIN_ID_PREFIX_LENGTH}.
     * Otherwise input of at least {@link MIN_ID_PREFIX_LENGTH} characters is
     * matched case-insensitively against the canonical ids: a unique match is
     * returned as `prefix`, several matches as `ambiguous` with all candidate
     * ids (in insertion order), and no match as `not-found`. Shorter input
     * yields `too-short`.
     */
    resolveId(idOrPrefix: string): IdResolution {
        const input = idOrPrefix.trim().toLowerCase();
        const exact = this.tasks[input];
        if (exact) {
            return { kind: 'exact', task: exact };
        }
        if (input.length < MIN_ID_PREFIX_LENGTH) {
            return { kind: 'too-short' };
        }
        const candidates = Object.values(this.tasks)
            .filter((t) => t.id.startsWith(input))
            .map((t) => t.id);
        if (candidates.length === 1) {
            return { kind: 'prefix', task: this.tasks[candidates[0]!]! };
        }
        if (candidates.length > 1) {
            return { kind: 'ambiguous', candidates };
        }
        return { kind: 'not-found' };
    }

    /** Returns all tasks. */
    getTasks(): Task[] {
        return Object.values(this.tasks);
    }

    /** Returns tasks that are not done and whose dependencies are all finished. */
    getAvailableTasks(): Task[] {
        return Object.values(this.tasks).filter(
            (t) =>
                t.status !== 'done' &&
                t.dependencies.every((depId) => this.isDependencySatisfied(depId))
        );
    }

    /** Returns the ids of `taskId`'s dependencies that are not yet finished. */
    getUnfinishedDependencyIds(taskId: string): UUID[] {
        const task = this.tasks[taskId];
        if (!task) {
            return [];
        }
        return task.dependencies.filter((depId) => !this.isDependencySatisfied(depId));
    }

    /**
     * Applies changes to a task: sets a status, refines the title/description or any
     * structured field, appends a timestamped progress-log entry, and/or adds a
     * dependency. `pending` and `ready` are derived from dependencies — adding an
     * unfinished dependency sets a task to `pending`, and a `pending` task becomes
     * `ready` once all its dependencies are finished. A task that is `in_progress`
     * or `done` cannot gain new dependencies. Array fields replace the whole array.
     * All validation happens before any change is applied.
     */
    async updateTask(id: string, changes: UpdateTaskInput): Promise<Task> {
        const task = this.tasks[id];
        if (!task) {
            throw new Error('Task not found with id: ' + id);
        }
        if (changes.status !== undefined && changes.addDependency !== undefined) {
            throw new Error('Cannot update task: status and addDependency are mutually exclusive');
        }
        await this.mutex.runExclusive(async () => {
            const merged: CreateTaskInput = {
                title: changes.title !== undefined ? normalizeText(changes.title) : task.title
            };
            if (changes.description !== undefined || task.description !== undefined) {
                merged.description = (
                    changes.description !== undefined ? changes.description : task.description
                )!;
            }
            if (changes.milestone !== undefined || task.milestone !== undefined) {
                merged.milestone = (
                    changes.milestone !== undefined ? changes.milestone : task.milestone
                )!;
            }
            if (changes.acceptanceCriteria !== undefined || task.acceptanceCriteria !== undefined) {
                merged.acceptanceCriteria = (
                    changes.acceptanceCriteria !== undefined
                        ? changes.acceptanceCriteria
                        : task.acceptanceCriteria
                )!;
            }
            if (changes.priority !== undefined || task.priority !== undefined) {
                merged.priority = (
                    changes.priority !== undefined ? changes.priority : task.priority
                )!;
            }
            if (changes.type !== undefined || task.type !== undefined) {
                merged.type = (changes.type !== undefined ? changes.type : task.type)!;
            }
            if (changes.links !== undefined || task.links !== undefined) {
                merged.links = (changes.links !== undefined ? changes.links : task.links)!;
            }
            for (const field of PLAN_FIELDS) {
                const change = changes[field];
                const current = task[field];
                if (change !== undefined || current !== undefined) {
                    merged[field] = (change !== undefined ? change : current)!;
                }
            }
            validateStructuredInput(merged, this.config);
            let logEntry: string | undefined;
            if (changes.history !== undefined) {
                logEntry = formatLogEntry(changes.history);
                const newLength = task.history.length + (task.history ? 1 : 0) + logEntry.length;
                if (newLength > this.config.maxHistoryLength) {
                    throw new Error(
                        'Cannot append progress entry: task log would exceed ' +
                            this.config.maxHistoryLength +
                            ' characters (has ' +
                            task.history.length +
                            ')'
                    );
                }
            }
            if (changes.status !== undefined) {
                this.assertStatusChangeAllowed(task, changes.status);
            }
            if (changes.addDependency !== undefined) {
                this.assertCanAddDependency(task, changes.addDependency);
            }
            this.applyFieldChanges(task, changes);
            if (logEntry !== undefined) {
                task.history = task.history ? task.history + '\n' + logEntry : logEntry;
            }
            if (changes.status !== undefined) {
                this.setStatusUnsafe(task, changes.status);
            }
            if (changes.addDependency !== undefined) {
                this.addDependencyUnsafe(task, changes.addDependency);
            }
            this.syncDerivedStatuses();
            await this.storeRef.set(task);
        });
        return task;
    }

    /**
     * Removes all tasks from the pool and empties the backing store.
     */
    async clear(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            this.clearMap();
            await this.storeRef.clear();
        });
    }

    private clearMap(): void {
        for (const key of Object.keys(this.tasks)) {
            delete this.tasks[key];
        }
    }

    private applyFieldChanges(task: Task, changes: UpdateTaskInput): void {
        if (changes.title !== undefined) {
            task.title = normalizeText(changes.title);
        }
        copyStructuredFields(changes, task);
    }

    private assertCanAddDependency(task: Task, dependsOnId: string): void {
        if (task.status === 'done' || task.status === 'in_progress') {
            throw new Error(
                'Cannot add dependency: a ' + task.status + ' task cannot gain new dependencies'
            );
        }
        if (dependsOnId === task.id) {
            throw new Error('Cannot add dependency: a task cannot depend on itself');
        }
        if (!this.tasks[dependsOnId]) {
            throw new Error('Dependency task not found with id: ' + dependsOnId);
        }
        if (task.dependencies.includes(dependsOnId as UUID)) {
            throw new Error('Cannot add dependency: task already depends on ' + dependsOnId);
        }
        if (this.wouldCreateCycle(task.id, dependsOnId)) {
            throw new Error('Cannot add dependency: this would create a cyclic dependency');
        }
    }

    private addDependencyUnsafe(task: Task, dependsOnId: string): void {
        this.assertCanAddDependency(task, dependsOnId);
        const dep = this.tasks[dependsOnId]!;
        task.dependencies.push(dep.id);
        if (dep.status !== 'done') {
            task.status = 'pending';
        }
    }

    private assertStatusChangeAllowed(task: Task, status: TaskStatus): void {
        if (status === 'pending') {
            throw new Error("Cannot set status to 'pending': it is derived from dependencies");
        }
        const unfinishedDeps = task.dependencies.filter(
            (depId) => !this.isDependencySatisfied(depId)
        );
        if (unfinishedDeps.length > 0) {
            throw new Error(
                'Cannot set status to ' +
                    status +
                    ' because the following dependencies are not yet finished: ' +
                    unfinishedDeps.join(', ')
            );
        }
    }

    private setStatusUnsafe(task: Task, status: TaskStatus): void {
        this.assertStatusChangeAllowed(task, status);
        task.status = status;
    }

    /** Derives `ready` from dependencies: `pending` tasks with no unfinished deps become `ready`. */
    private syncDerivedStatuses(): void {
        for (const task of Object.values(this.tasks)) {
            if (
                task.status === 'pending' &&
                task.dependencies.every((depId) => this.isDependencySatisfied(depId))
            ) {
                task.status = 'ready';
            }
        }
    }

    /** Returns true when adding `childId` as a dependency of `parentId` would create a cycle. */
    private wouldCreateCycle(parentId: string, childId: string): boolean {
        const visited = new Set<string>();
        const queue = [...this.tasks[childId]!.dependencies];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === parentId) return true;
            if (visited.has(current)) continue;
            visited.add(current);
            const deps = this.tasks[current]?.dependencies ?? [];
            queue.push(...deps);
        }
        return false;
    }

    /** True when a dependency is not blocking: the referenced task is missing or done. */
    private isDependencySatisfied(depId: string): boolean {
        const dep = this.tasks[depId];
        return dep === undefined || dep.status === 'done';
    }
}
