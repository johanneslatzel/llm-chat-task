import { readFile, writeFile } from 'node:fs/promises';
import { Mutex } from 'async-mutex';
import { randomUUID, UUID } from 'crypto';
import { TaskConfiguration } from './lib/config.js';
import { PlanField, Task, TaskPriority, TaskStatus, TaskType } from './types.js';

export type { Task, TaskStatus, TaskPriority, TaskType, PlanField };

/** Input for creating a task via `TaskPool.createTask`. */
export type CreateTaskInput = {
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
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

type TaskFile = {
    tasks: Array<{
        id: string;
        title: string;
        description?: string;
        acceptanceCriteria?: string[];
        priority?: TaskPriority;
        type?: TaskType;
        links?: string[];
        steps?: string[];
        constraints?: string[];
        outOfScope?: string[];
        verification?: string[];
        context?: string[];
        edgeCases?: string[];
        history: string;
        status: TaskStatus;
        dependencyIds: string[];
    }>;
};

const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
const TYPES: readonly TaskType[] = ['feature', 'bug', 'refactor', 'chore', 'research'];
const PLAN_FIELDS: readonly PlanField[] = [
    'steps',
    'constraints',
    'outOfScope',
    'verification',
    'context',
    'edgeCases'
];

function isTaskStatus(value: unknown): value is TaskStatus {
    return value === 'pending' || value === 'ready' || value === 'in_progress' || value === 'done';
}

function isTaskPriority(value: unknown): value is TaskPriority {
    return value === 'low' || value === 'medium' || value === 'high';
}

function isTaskType(value: unknown): value is TaskType {
    return (
        value === 'feature' ||
        value === 'bug' ||
        value === 'refactor' ||
        value === 'chore' ||
        value === 'research'
    );
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

/** In-memory task pool with dependency tracking and optional file persistence. */
export class TaskPool {
    /** Limits enforced by this pool; fixed at construction. */
    readonly config: TaskConfiguration;
    private readonly tasks: Record<string, Task> = {};
    private readonly mutex: Mutex = new Mutex();

    /** @param config Task limits; defaults to a fresh {@link TaskConfiguration}. */
    constructor(config?: TaskConfiguration) {
        this.config = config ?? new TaskConfiguration();
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
        if (input.description !== undefined) {
            task.description = normalizeText(input.description);
        }
        if (input.acceptanceCriteria !== undefined) {
            task.acceptanceCriteria = input.acceptanceCriteria.map(normalizeText);
        }
        if (input.priority !== undefined) {
            task.priority = input.priority;
        }
        if (input.type !== undefined) {
            task.type = input.type;
        }
        if (input.links !== undefined) {
            task.links = input.links.map(normalizeText);
        }
        for (const field of PLAN_FIELDS) {
            if (input[field] !== undefined) {
                task[field] = input[field].map(normalizeText);
            }
        }
        await this.mutex.runExclusive(() => {
            this.tasks[task.id] = task;
        });
        return task.id;
    }

    /** Returns a task by id, or `undefined` when it does not exist. */
    getTask(id: string): Task | undefined {
        return this.tasks[id];
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
        await this.mutex.runExclusive(() => {
            const updated: Record<string, unknown> = {};
            if (changes.title !== undefined) {
                updated.title = normalizeText(changes.title);
            }
            if (changes.description !== undefined) {
                updated.description = normalizeText(changes.description);
            }
            const merged: CreateTaskInput = {
                title: changes.title !== undefined ? normalizeText(changes.title) : task.title
            };
            if (changes.description !== undefined || task.description !== undefined) {
                merged.description = (
                    changes.description !== undefined ? changes.description : task.description
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
            this.applyFieldChanges(task, changes, updated);
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
        });
        return task;
    }

    /** Removes all tasks from the pool. */
    clear(): void {
        for (const key of Object.keys(this.tasks)) {
            delete this.tasks[key];
        }
    }

    /** Replaces the pool contents with the tasks stored at `path`. */
    async loadFromFile(path: string): Promise<void> {
        const data = JSON.parse(await readFile(path, 'utf-8')) as TaskFile;
        await this.mutex.runExclusive(() => {
            this.replaceAll(data);
        });
    }

    /** Writes all tasks to `path`, storing dependencies by id. */
    async save(path: string): Promise<void> {
        const data = await this.mutex.runExclusive(() => {
            const tasks = Object.values(this.tasks).map((t) => ({
                id: t.id,
                title: t.title,
                description: t.description,
                acceptanceCriteria: t.acceptanceCriteria,
                priority: t.priority,
                type: t.type,
                links: t.links,
                steps: t.steps,
                constraints: t.constraints,
                outOfScope: t.outOfScope,
                verification: t.verification,
                context: t.context,
                edgeCases: t.edgeCases,
                history: t.history,
                status: t.status,
                dependencyIds: t.dependencies
            }));
            return JSON.stringify({ tasks }, null, 2);
        });
        await writeFile(path, data, 'utf-8');
    }

    /** Creates a pool loaded from the tasks stored at `path`. */
    static async load(path: string): Promise<TaskPool> {
        const data = JSON.parse(await readFile(path, 'utf-8')) as TaskFile;
        const pool = new TaskPool();
        await pool.mutex.runExclusive(() => {
            pool.replaceAll(data);
        });
        return pool;
    }

    private replaceAll(data: TaskFile): void {
        for (const t of data.tasks) {
            if (!isTaskStatus(t.status)) {
                throw new Error('Invalid task status in file: ' + String(t.status));
            }
            if (typeof t.title !== 'string') {
                throw new Error('Invalid task title in file');
            }
            validateStructuredInput(
                {
                    title: t.title,
                    description: t.description,
                    acceptanceCriteria: t.acceptanceCriteria,
                    priority: t.priority,
                    type: t.type,
                    links: t.links,
                    steps: t.steps,
                    constraints: t.constraints,
                    outOfScope: t.outOfScope,
                    verification: t.verification,
                    context: t.context,
                    edgeCases: t.edgeCases
                },
                this.config
            );
            if (typeof t.history !== 'string') {
                throw new Error('Invalid task history in file');
            }
        }
        this.clear();
        const byId: Record<string, Task> = {};
        for (const t of data.tasks) {
            const task: Task = {
                id: t.id as UUID,
                title: normalizeText(t.title),
                history: t.history,
                status: t.status,
                dependencies: []
            };
            if (t.description !== undefined) {
                task.description = normalizeText(t.description);
            }
            if (t.acceptanceCriteria !== undefined) {
                task.acceptanceCriteria = t.acceptanceCriteria.map(normalizeText);
            }
            if (t.priority !== undefined) {
                task.priority = t.priority;
            }
            if (t.type !== undefined) {
                task.type = t.type;
            }
            if (t.links !== undefined) {
                task.links = t.links.map(normalizeText);
            }
            for (const field of PLAN_FIELDS) {
                if (t[field] !== undefined) {
                    task[field] = t[field].map(normalizeText);
                }
            }
            byId[task.id] = task;
            this.tasks[task.id] = task;
        }
        for (const t of data.tasks) {
            const task = byId[t.id]!;
            for (const depId of t.dependencyIds) {
                if (byId[depId]) {
                    task.dependencies.push(depId as UUID);
                }
            }
        }
    }

    private applyFieldChanges(
        task: Task,
        changes: UpdateTaskInput,
        normalized: Record<string, unknown>
    ): void {
        if (changes.title !== undefined) {
            task.title = normalized.title as string;
        }
        if (changes.description !== undefined) {
            task.description = normalized.description as string;
        }
        if (changes.acceptanceCriteria !== undefined) {
            task.acceptanceCriteria = changes.acceptanceCriteria.map(normalizeText);
        }
        if (changes.priority !== undefined) {
            task.priority = changes.priority;
        }
        if (changes.type !== undefined) {
            task.type = changes.type;
        }
        if (changes.links !== undefined) {
            task.links = changes.links.map(normalizeText);
        }
        for (const field of PLAN_FIELDS) {
            if (changes[field] !== undefined) {
                task[field] = changes[field].map(normalizeText);
            }
        }
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
