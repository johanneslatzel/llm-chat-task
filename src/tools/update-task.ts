import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import { TaskPool, UpdateTaskInput } from '../pool.js';
import type { TaskPriority, TaskStatus, TaskType } from '../types.js';

const SETTABLE_STATUSES: readonly TaskStatus[] = ['ready', 'in_progress', 'done'];

/** Updates a task: status, any structured field, progress log, and/or a dependency. */
export class UpdateTaskTool extends Tool {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super(
            'update_task',
            'Use this tool to update a task: set its status (ready, in_progress or done), refine its ' +
                'title or any structured plan field, append a timestamped entry to its progress log, ' +
                'or add a dependency on another task. Status and dependency_id are mutually exclusive. ' +
                'When marking a task done, record a short summary of what was completed in history so ' +
                'the result is not lost. Array fields (acceptance_criteria, steps, constraints, ' +
                'out_of_scope, verification, context, edge_cases, links) replace the whole array. ' +
                'To update a plan field, pass the complete new list.',
            new ToolParameters(
                {
                    id: ToolParameterProperty.string('The id of the task to update'),
                    status: ToolParameterProperty.string(
                        'The new status: ready, in_progress or done. pending is derived automatically.'
                    ),
                    history: ToolParameterProperty.string(
                        'Appends a timestamped entry to the task progress log. Entries accumulate; the log is capped at ' +
                            pool.config.maxHistoryLength +
                            ' characters. When marking a task done, record the outcome here.'
                    ),
                    dependency_id: ToolParameterProperty.string(
                        'The id of a task this task should depend on'
                    ),
                    title: ToolParameterProperty.string(
                        'New title. Must be non-empty and at most ' +
                            pool.config.maxTitleLength +
                            ' characters.'
                    ),
                    description: ToolParameterProperty.string(
                        'New description. Must be non-empty and at most ' +
                            pool.config.maxDescriptionLength +
                            ' characters.'
                    ),
                    acceptance_criteria: ToolParameterProperty.array(
                        'New acceptance criteria list. Replaces the whole array. At most ' +
                            pool.config.maxAcceptanceCriteriaCount +
                            ' items, each at most ' +
                            pool.config.maxAcceptanceCriteriaLength +
                            ' characters.'
                    ),
                    steps: ToolParameterProperty.array(
                        'New steps list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    context: ToolParameterProperty.array(
                        'New context list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    constraints: ToolParameterProperty.array(
                        'New constraints list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    out_of_scope: ToolParameterProperty.array(
                        'New out-of-scope list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    verification: ToolParameterProperty.array(
                        'New verification list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    edge_cases: ToolParameterProperty.array(
                        'New edge-cases list. Replaces the whole array. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    priority: ToolParameterProperty.string(
                        'New priority: low, medium or high. Omit to leave unchanged.'
                    ),
                    type: ToolParameterProperty.string(
                        'New type: feature, bug, refactor, chore or research. Omit to leave unchanged.'
                    ),
                    links: ToolParameterProperty.array(
                        'New links list. Replaces the whole array. At most ' +
                            pool.config.maxLinksPerTask +
                            ' items, each a valid URL.'
                    )
                },
                ['id']
            )
        );
        this.pool = pool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        if (args.id === undefined || typeof args.id !== 'string') {
            return {
                result: "Required parameter 'id' is missing or not a string",
                status: ResultStatus.Error
            };
        }
        const status = typeof args.status === 'string' ? args.status : undefined;
        if (status !== undefined && !this.isSettableStatus(status)) {
            if (status === 'pending') {
                return {
                    result: "Status 'pending' is derived automatically and cannot be set directly",
                    status: ResultStatus.Error
                };
            }
            return {
                result:
                    "Invalid status '" +
                    status +
                    "'. Allowed values: " +
                    SETTABLE_STATUSES.join(', '),
                status: ResultStatus.Error
            };
        }
        const dependencyId =
            typeof args.dependency_id === 'string' ? args.dependency_id : undefined;
        if (status !== undefined && dependencyId !== undefined) {
            return {
                result: "Parameters 'status' and 'dependency_id' are mutually exclusive",
                status: ResultStatus.Error
            };
        }
        try {
            const changes = this.toUpdateTaskInput(args, status, dependencyId);
            const task = await this.pool.updateTask(args.id, changes);
            const parts = ['Task updated with id: ' + args.id + ', status: ' + task.status];
            if (changes.title !== undefined) {
                parts.push('title updated');
            }
            if (changes.description !== undefined) {
                parts.push('description updated');
            }
            if (changes.acceptanceCriteria !== undefined) {
                parts.push('acceptance criteria updated');
            }
            if (changes.priority !== undefined) {
                parts.push('priority updated');
            }
            if (changes.type !== undefined) {
                parts.push('type updated');
            }
            if (changes.links !== undefined) {
                parts.push('links updated');
            }
            if (changes.steps !== undefined) {
                parts.push('steps updated');
            }
            if (changes.context !== undefined) {
                parts.push('context updated');
            }
            if (changes.constraints !== undefined) {
                parts.push('constraints updated');
            }
            if (changes.outOfScope !== undefined) {
                parts.push('out-of-scope updated');
            }
            if (changes.verification !== undefined) {
                parts.push('verification updated');
            }
            if (changes.edgeCases !== undefined) {
                parts.push('edge cases updated');
            }
            if (changes.history !== undefined) {
                parts.push('progress entry recorded');
            }
            if (changes.addDependency !== undefined) {
                parts.push('now depends on ' + changes.addDependency);
            }
            return { result: parts.join(', '), status: ResultStatus.Success };
        } catch (e) {
            return { result: (e as Error).message, status: ResultStatus.Error };
        }
    }

    private toUpdateTaskInput(
        args: Record<string, unknown>,
        status: string | undefined,
        dependencyId: string | undefined
    ): UpdateTaskInput {
        const changes: UpdateTaskInput = {};
        if (status !== undefined) {
            changes.status = status as TaskStatus;
        }
        if (typeof args.history === 'string') {
            changes.history = args.history;
        }
        if (dependencyId !== undefined) {
            changes.addDependency = dependencyId;
        }
        if (typeof args.title === 'string') {
            changes.title = args.title;
        }
        if (typeof args.description === 'string') {
            changes.description = args.description;
        }
        if (Array.isArray(args.acceptance_criteria)) {
            changes.acceptanceCriteria = args.acceptance_criteria as string[];
        }
        if (typeof args.priority === 'string') {
            changes.priority = args.priority as TaskPriority;
        }
        if (typeof args.type === 'string') {
            changes.type = args.type as TaskType;
        }
        if (Array.isArray(args.links)) {
            changes.links = args.links as string[];
        }
        if (Array.isArray(args.steps)) {
            changes.steps = args.steps as string[];
        }
        if (Array.isArray(args.context)) {
            changes.context = args.context as string[];
        }
        if (Array.isArray(args.constraints)) {
            changes.constraints = args.constraints as string[];
        }
        if (Array.isArray(args.out_of_scope)) {
            changes.outOfScope = args.out_of_scope as string[];
        }
        if (Array.isArray(args.verification)) {
            changes.verification = args.verification as string[];
        }
        if (Array.isArray(args.edge_cases)) {
            changes.edgeCases = args.edge_cases as string[];
        }
        return changes;
    }

    private isSettableStatus(value: string): value is Exclude<TaskStatus, 'pending'> {
        return value === 'ready' || value === 'in_progress' || value === 'done';
    }
}
