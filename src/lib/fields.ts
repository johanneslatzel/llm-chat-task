import type { PlanField, TaskPriority, TaskStatus, TaskType } from '../types.js';

/** All task lifecycle statuses, including the derived `pending`. */
export const STATUSES: readonly TaskStatus[] = ['pending', 'ready', 'in_progress', 'done'];

/** Stated importance values. */
export const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

/** Kind-of-work values. */
export const TYPES: readonly TaskType[] = ['feature', 'bug', 'refactor', 'chore', 'research'];

/** The plan-carrying array fields on a task. */
export const PLAN_FIELDS = [
    'steps',
    'constraints',
    'outOfScope',
    'verification',
    'context',
    'edgeCases'
] as const satisfies readonly PlanField[];

/** Every string-array task field; scanned by `read_task` queries (items reported as `<field>[<index>]`). */
export const STRING_ARRAY_FIELDS = ['acceptanceCriteria', 'links', ...PLAN_FIELDS] as const;

/** The optional structured task fields shared by create and update tool inputs. */
export type StructuredFields = {
    description?: string;
    milestone?: string;
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

/** Tool-arg (snake_case) names mapped to their task-field (camelCase) names. */
const ARRAY_ARG_FIELDS: ReadonlyArray<readonly [string, (typeof STRING_ARRAY_FIELDS)[number]]> = [
    ['acceptance_criteria', 'acceptanceCriteria'],
    ['links', 'links'],
    ['steps', 'steps'],
    ['context', 'context'],
    ['constraints', 'constraints'],
    ['out_of_scope', 'outOfScope'],
    ['verification', 'verification'],
    ['edge_cases', 'edgeCases']
];

/**
 * Copies the structured fields present in tool args (snake_case) onto a task input
 * (camelCase). Shared by create_task and update_task so the mapping stays in sync.
 */
export function applyStructuredFields(
    args: Record<string, unknown>,
    target: StructuredFields
): void {
    if (typeof args.description === 'string') {
        target.description = args.description;
    }
    if (typeof args.milestone === 'string') {
        target.milestone = args.milestone;
    }
    if (typeof args.priority === 'string') {
        target.priority = args.priority as TaskPriority;
    }
    if (typeof args.type === 'string') {
        target.type = args.type as TaskType;
    }
    for (const [argName, fieldName] of ARRAY_ARG_FIELDS) {
        const value = args[argName];
        if (Array.isArray(value)) {
            target[fieldName] = value as string[];
        }
    }
}
