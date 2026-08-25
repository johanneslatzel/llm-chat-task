import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import { MIN_ID_PREFIX_LENGTH } from '../constants.js';
import { PRIORITIES, STATUSES, STRING_ARRAY_FIELDS, TYPES } from '../lib/fields.js';
import { resolveExactOrError } from '../lib/id-resolution.js';
import type { Task, TaskPriority, TaskStatus, TaskType } from '../types.js';
import { TaskPool } from '../pool.js';

/** A task kept by a listing filter, plus the fields that matched `query` when one is active. */
interface ListingEntry {
    task: Task;
    matchedFields?: string[];
}

/** Reads tasks: one by (possibly shortened) id, or a listing filtered by availability, enums and a regex field search. */
export class ReadTaskTool extends Tool {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super(
            'read_task',
            'Use this tool to read tasks. Pass an id to read a single task (full structured fields and ' +
                'progress log); a shortened id of at least ' +
                MIN_ID_PREFIX_LENGTH +
                ' characters is accepted when it matches exactly one task. Or pass query, a JavaScript ' +
                'regex matched case-insensitively against task fields, with results annotated via ' +
                'matchedFields. Set available to list tasks that can be worked on right now, omit both ' +
                'to list all tasks that are not done, and optionally filter listings by status, priority, ' +
                'type or milestone. Listings truncate long text fields; use an id to get the full detail.',
            new ToolParameters({
                id: ToolParameterProperty.string(
                    'The id of the task to read; a shortened id of at least ' +
                        MIN_ID_PREFIX_LENGTH +
                        ' characters resolves when unique'
                ),
                query: ToolParameterProperty.string(
                    'JavaScript regex to search task fields (case-insensitive). Matches against title, ' +
                        'description, id, history and every string-array item; results include matchedFields ' +
                        'naming what matched. Mutually exclusive with id.'
                ),
                strict: ToolParameterProperty.boolean(
                    'When true (default), query is compiled with the Unicode "u" flag, which rejects legacy ' +
                        'escape sequences like \\" that LLMs often produce. Set strict=false to allow such ' +
                        'escapes (the pattern is then compiled with only the "i" flag).'
                ),
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
                ),
                milestone: ToolParameterProperty.string(
                    'When listing, keep only tasks whose milestone equals this value exactly ' +
                        '(compared after trimming)'
                )
            })
        );
        this.pool = pool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const id = typeof args.id === 'string' ? args.id : undefined;
        const available = typeof args.available === 'boolean' ? args.available : undefined;
        const rawQuery =
            typeof args.query === 'string' && args.query.trim().length > 0
                ? args.query.trim()
                : undefined;
        const strict = args.strict !== false;
        if (id !== undefined && available !== undefined) {
            return {
                result: "Parameters 'id' and 'available' are mutually exclusive",
                status: ResultStatus.Error
            };
        }
        if (id !== undefined && rawQuery !== undefined) {
            return {
                result: "Parameters 'id' and 'query' are mutually exclusive",
                status: ResultStatus.Error
            };
        }
        const compiled = this.compileQuery(rawQuery, strict);
        if (!compiled.ok) {
            return compiled.error;
        }
        if (id !== undefined) {
            const resolved = resolveExactOrError(this.pool, id);
            if (!resolved.ok) {
                return resolved.error;
            }
            return {
                result: JSON.stringify(this.serialize(resolved.task, false), null, 2),
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
        const entries: ListingEntry[] = [];
        for (const task of filtered) {
            if (compiled.regex === undefined) {
                entries.push({ task });
                continue;
            }
            const matchedFields = this.matchFields(task, compiled.regex);
            if (matchedFields.length > 0) {
                entries.push({ task, matchedFields });
            }
        }
        return {
            result: JSON.stringify(
                entries.map((e) => this.serialize(e.task, true, e.matchedFields)),
                null,
                2
            ),
            status: ResultStatus.Success
        };
    }

    /**
     * Compiles the query pattern case-insensitively, using the Unicode "u" flag in strict mode.
     * Mirrors llm-chat-file's regex handling so agents get consistent behavior across tools.
     */
    private compileQuery(
        raw: string | undefined,
        strict: boolean
    ): { ok: true; regex?: RegExp } | { ok: false; error: PartialToolResult } {
        if (raw === undefined) {
            return { ok: true };
        }
        try {
            return { ok: true, regex: new RegExp(raw, strict ? 'iu' : 'i') };
        } catch (e) {
            const hint = strict
                ? ' (Set strict=false to allow legacy escape sequences like \\" which fail under the Unicode "u" flag.)'
                : '';
            return {
                ok: false,
                error: {
                    result: 'Invalid query regex: ' + (e as Error).message + hint,
                    status: ResultStatus.Error
                }
            };
        }
    }

    /** Returns the names of all task fields whose text matches the regex, e.g. `title` or `steps[2]`. */
    private matchFields(task: Task, regex: RegExp): string[] {
        const matches: string[] = [];
        const testField = (name: string, value: string | undefined): void => {
            if (value !== undefined && regex.test(value)) {
                matches.push(name);
            }
        };
        testField('title', task.title);
        testField('description', task.description);
        testField('milestone', task.milestone);
        testField('id', task.id);
        testField('history', task.history);
        for (const field of STRING_ARRAY_FIELDS) {
            task[field]?.forEach((value, index) => testField(field + '[' + index + ']', value));
        }
        return matches;
    }

    private applyFilters(tasks: Task[], args: Record<string, unknown>): Task[] {
        const status = typeof args.status === 'string' ? args.status : undefined;
        const priority = typeof args.priority === 'string' ? args.priority : undefined;
        const type = typeof args.type === 'string' ? args.type : undefined;
        const milestone = typeof args.milestone === 'string' ? args.milestone.trim() : undefined;
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
                (type === undefined || t.type === type) &&
                (milestone === undefined || t.milestone === milestone)
        );
    }

    private serialize(task: Task, previewArrays: boolean, matchedFields?: string[]): unknown {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            milestone: task.milestone,
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
            unfinishedDependencies: this.pool.getUnfinishedDependencyIds(task.id),
            ...(matchedFields !== undefined ? { matchedFields } : {})
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
