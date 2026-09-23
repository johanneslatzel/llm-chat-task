import { PLAN_FIELDS, PRIORITIES, STATUSES, TYPES } from './fields.js';
import type { TaskConfiguration } from './config.js';
import type { PlanField, Task, TaskPriority, TaskStatus, TaskType } from '../types.js';
import type { CreateTaskInput } from '../pool.js';

function isTaskStatus(value: unknown): value is TaskStatus {
    return (STATUSES as readonly unknown[]).includes(value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
    return (PRIORITIES as readonly unknown[]).includes(value);
}

function isTaskType(value: unknown): value is TaskType {
    return (TYPES as readonly unknown[]).includes(value);
}

/** Canonical UUID shape (8-4-4-4-12 hex digits, version-agnostic). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when `value` is a canonical UUID string. `UUID` is a branded
 * `string` at runtime, so this is the only way to check the shape.
 */
export function isUuid(value: unknown): boolean {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Validates that a dependency value is a canonical UUID string. */
export function validateUuid(value: unknown, label: string): void {
    if (!isUuid(value)) {
        throw new Error(label + ' must be a UUID (got ' + String(value) + ')');
    }
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
            label + ' must be at most ' + maxLength + ' characters (got ' + text.length + ')',
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
            label + ' must have at most ' + maxCount + ' items (got ' + list.length + ')',
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
            "Invalid priority '" + value + "'. Allowed values: " + PRIORITIES.join(', '),
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

/** Human label for a plan field, e.g. `outOfScope` -> `Out of scope`. */
function fieldLabel(field: PlanField): string {
    const withSpaces = field
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/** Validates all structured input fields. Undefined fields are ignored. */
export function validateStructuredInput(input: StructuredInput, config: TaskConfiguration): void {
    const title = normalizeText(input.title);
    validateTitle(title, config.maxTitleLength);
    validateDescription(input.description, config.maxDescriptionLength);
    validateMilestone(input.milestone, config.maxMilestoneLength);
    validateTextList(
        input.acceptanceCriteria,
        config.maxAcceptanceCriteriaCount,
        config.maxAcceptanceCriteriaLength,
        'Acceptance criteria',
    );
    validatePriority(input.priority);
    validateType(input.type);
    validateLinks(input.links, config.maxLinksPerTask);
    for (const field of PLAN_FIELDS) {
        validateTextList(
            input[field],
            config.maxPlanFieldCount,
            config.maxPlanFieldLength,
            fieldLabel(field),
        );
    }
}

/** Formats a progress-log entry with its timestamp. */
export function formatLogEntry(entry: string): string {
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
export function copyStructuredFields(source: FieldSource, target: Task): void {
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
export function validateTask(task: Task, config: TaskConfiguration): void {
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
            edgeCases: task.edgeCases,
        },
        config,
    );
    if (typeof task.history !== 'string') {
        throw new Error('Invalid task history in store');
    }
}

/** Normalizes text (trims whitespace). */
export { normalizeText };
