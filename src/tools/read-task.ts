import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import type { Task, TaskPriority, TaskStatus, TaskType } from '../types.js';
import { TaskPool } from '../pool.js';

const STATUSES: readonly TaskStatus[] = ['pending', 'ready', 'in_progress', 'done'];
const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
const TYPES: readonly TaskType[] = ['feature', 'bug', 'refactor', 'chore', 'research'];

/** Reads tasks: one by id, or a (filtered) listing of not-done tasks, optionally limited to available ones. */
export class ReadTaskTool extends Tool {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super(
            'read_task',
            'Use this tool to read tasks. Pass an id to read a single task (full structured fields and ' +
                'progress log), set available to list tasks that can be worked on right now, or omit ' +
                'both to list all tasks that are not done. Optionally filter listings by status, ' +
                'priority or type. Listings truncate long text fields; use an id to get the full detail.',
            new ToolParameters({
                id: ToolParameterProperty.string('The id of the task to read'),
                available: ToolParameterProperty.boolean(
                    'When true, list only tasks that have no unfinished dependencies and are not done'
                ),
                status: ToolParameterProperty.string(
                    'When listing, keep only tasks with this status: ' + STATUSES.join(', ')
                ),
                priority: ToolParameterProperty.string(
                    'When listing, keep only tasks with this priority: ' + PRIORITIES.join(', ')
                ),
                type: ToolParameterProperty.string(
                    'When listing, keep only tasks with this type: ' + TYPES.join(', ')
                )
            })
        );
        this.pool = pool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const id = typeof args.id === 'string' ? args.id : undefined;
        const available = typeof args.available === 'boolean' ? args.available : undefined;
        if (id !== undefined && available !== undefined) {
            return {
                result: "Parameters 'id' and 'available' are mutually exclusive",
                status: ResultStatus.Error
            };
        }
        if (id !== undefined) {
            const task = this.pool.getTask(id);
            if (!task) {
                return { result: 'Task not found with id: ' + id, status: ResultStatus.Error };
            }
            return {
                result: JSON.stringify(this.serialize(task, false), null, 2),
                status: ResultStatus.Success
            };
        }
        const statusFilter = typeof args.status === 'string' ? args.status : undefined;
        let base: Task[];
        if (available === true) {
            base = this.pool.getAvailableTasks();
        } else if (statusFilter === undefined) {
            base = this.pool.getTasks().filter((t) => t.status !== 'done');
        } else {
            base = this.pool.getTasks();
        }
        const filtered = this.applyFilters(base, args);
        return {
            result: JSON.stringify(
                filtered.map((t) => this.serialize(t, true)),
                null,
                2
            ),
            status: ResultStatus.Success
        };
    }

    private applyFilters(tasks: Task[], args: Record<string, unknown>): Task[] {
        const status = typeof args.status === 'string' ? args.status : undefined;
        const priority = typeof args.priority === 'string' ? args.priority : undefined;
        const type = typeof args.type === 'string' ? args.type : undefined;
        if (status !== undefined && !this.isStatus(status)) {
            throw new Error(
                "Invalid status filter '" + status + "'. Allowed values: " + STATUSES.join(', ')
            );
        }
        if (priority !== undefined && !this.isPriority(priority)) {
            throw new Error(
                "Invalid priority filter '" +
                    priority +
                    "'. Allowed values: " +
                    PRIORITIES.join(', ')
            );
        }
        if (type !== undefined && !this.isType(type)) {
            throw new Error(
                "Invalid type filter '" + type + "'. Allowed values: " + TYPES.join(', ')
            );
        }
        return tasks.filter(
            (t) =>
                (status === undefined || t.status === status) &&
                (priority === undefined || t.priority === priority) &&
                (type === undefined || t.type === type)
        );
    }

    private serialize(task: Task, previewArrays: boolean): unknown {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            acceptanceCriteria: this.array(task.acceptanceCriteria, previewArrays),
            priority: task.priority,
            type: task.type,
            links: this.array(task.links, previewArrays),
            steps: this.array(task.steps, previewArrays),
            context: this.array(task.context, previewArrays),
            constraints: this.array(task.constraints, previewArrays),
            outOfScope: this.array(task.outOfScope, previewArrays),
            verification: this.array(task.verification, previewArrays),
            edgeCases: this.array(task.edgeCases, previewArrays),
            status: task.status,
            history: previewArrays ? this.preview(task.history) : task.history,
            dependencies: task.dependencies,
            unfinishedDependencies: this.pool.getUnfinishedDependencyIds(task.id)
        };
    }

    private array(values: string[] | undefined, previewArrays: boolean): string[] | undefined {
        if (values === undefined) {
            return undefined;
        }
        if (!previewArrays) {
            return values;
        }
        return values.map((v) => this.preview(v));
    }

    private preview(text: string): string {
        const max = this.pool.config.historyPreviewLength;
        if (text.length <= max) {
            return text;
        }
        return text.slice(0, max) + '...';
    }

    private isStatus(value: string): value is TaskStatus {
        return (STATUSES as readonly string[]).includes(value);
    }

    private isPriority(value: string): value is TaskPriority {
        return (PRIORITIES as readonly string[]).includes(value);
    }

    private isType(value: string): value is TaskType {
        return (TYPES as readonly string[]).includes(value);
    }
}
