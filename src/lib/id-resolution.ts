import { PartialToolResult, ResultStatus } from '@johannes.latzel/llm-chat';
import { MIN_ID_PREFIX_LENGTH } from '../constants.js';
import { IdResolution, TaskPool } from '../pool.js';
import type { Task } from '../types.js';

/** Resolution outcomes that do not identify a single task. */
export type FailedIdResolution = Exclude<IdResolution, { kind: 'exact' } | { kind: 'prefix' }>;

/**
 * Resolves an id to its task, or maps the resolution failure to a plain-string tool error.
 * Lets tools share the resolve-then-guard pattern: {@link resolveId} + {@link resolutionError}.
 */
export function resolveExactOrError(
    pool: TaskPool,
    id: string
): { ok: true; task: Task } | { ok: false; error: PartialToolResult } {
    const resolution = pool.resolveId(id);
    if (resolution.kind !== 'exact' && resolution.kind !== 'prefix') {
        return { ok: false, error: resolutionError(id, resolution) };
    }
    return { ok: true, task: resolution.task };
}

/** Maps an unresolvable id to a plain-string tool error. */
export function resolutionError(id: string, resolution: FailedIdResolution): PartialToolResult {
    if (resolution.kind === 'ambiguous') {
        return {
            result:
                "Ambiguous id prefix '" +
                id +
                "' matches multiple tasks:\n" +
                resolution.candidates.join('\n'),
            status: ResultStatus.Error
        };
    }
    if (resolution.kind === 'too-short') {
        return {
            result:
                "Id '" +
                id +
                "' is too short to identify a task. Use at least " +
                MIN_ID_PREFIX_LENGTH +
                ' characters or a full id.',
            status: ResultStatus.Error
        };
    }
    return { result: 'Task not found with id: ' + id, status: ResultStatus.Error };
}
