import { describe, it, expect } from 'vitest';
import { TaskPool, ReadTaskTool } from '../../src/index.js';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import type { Task } from '../../src/types.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

type SerializedTask = Task & { unfinishedDependencies: string[] };

function parseTasks(result: unknown): Task[] {
    return JSON.parse(result as string) as Task[];
}

describe('ReadTaskTool', () => {
    it('reads a single task by id with all fields', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({
            title: 'Task A',
            description: 'the goal',
            acceptanceCriteria: ['c1'],
            priority: 'high',
            type: 'bug',
            links: ['https://example.com'],
            steps: ['s1'],
            context: ['ctx'],
            constraints: ['x'],
            outOfScope: ['o'],
            verification: ['v'],
            edgeCases: ['e']
        });
        await pool.updateTask(id, { status: 'in_progress', history: 'working' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ id });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = JSON.parse(result[0]!.result) as SerializedTask;
        expect(task.id).toBe(id);
        expect(task.title).toBe('Task A');
        expect(task.description).toBe('the goal');
        expect(task.acceptanceCriteria).toEqual(['c1']);
        expect(task.priority).toBe('high');
        expect(task.type).toBe('bug');
        expect(task.links).toEqual(['https://example.com']);
        expect(task.steps).toEqual(['s1']);
        expect(task.context).toEqual(['ctx']);
        expect(task.constraints).toEqual(['x']);
        expect(task.outOfScope).toEqual(['o']);
        expect(task.verification).toEqual(['v']);
        expect(task.edgeCases).toEqual(['e']);
        expect(task.status).toBe('in_progress');
        expect(task.history).toMatch(/^\[.+\] working$/);
        expect(task.dependencies).toEqual([]);
        expect(task.unfinishedDependencies).toEqual([]);
    });

    it('reports an error for an unknown task id', async () => {
        const tool = new ReadTaskTool(new TaskPool());
        const result = await tool.execute({ id: 'nonexistent' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('not found');
    });

    it('lists all tasks that are not done when no params are given', async () => {
        const pool = new TaskPool();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        await pool.updateTask(idC, { status: 'done' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({});
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const tasks = parseTasks(result[0]!.result);
        expect(tasks.map((t) => t.id)).toEqual([idA, idB]);
        expect(tasks.every((t) => t.status !== 'done')).toBe(true);
    });

    it('lists only available tasks when the available flag is set', async () => {
        const pool = new TaskPool();
        const idReady = await pool.createTask({ title: 'Ready' });
        const idInProgress = await pool.createTask({ title: 'In progress' });
        const idPending = await pool.createTask({ title: 'Pending' });
        const idDone = await pool.createTask({ title: 'Done' });
        const dep = await pool.createTask({ title: 'Dep' });
        await pool.updateTask(idPending, { addDependency: dep });
        await pool.updateTask(idDone, { status: 'done' });
        await pool.updateTask(idInProgress, { status: 'in_progress' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ available: true });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const tasks = parseTasks(result[0]!.result);
        expect(tasks.map((t) => t.id)).toEqual([idReady, idInProgress, dep]);
    });

    it('filters listings by status, priority and type', async () => {
        const pool = new TaskPool();
        const idHigh = await pool.createTask({ title: 'High bug', priority: 'high', type: 'bug' });
        await pool.createTask({ title: 'Low feature', priority: 'low', type: 'feature' });
        await pool.createTask({ title: 'No priority' });
        const tool = new ReadTaskTool(pool);
        const byPriority = await tool.execute({ priority: 'high' });
        const byPriorityTasks = parseTasks(byPriority[0]!.result);
        expect(byPriorityTasks.map((t) => t.id)).toEqual([idHigh]);
        const byType = await tool.execute({ type: 'feature' });
        const byTypeTasks = parseTasks(byType[0]!.result);
        expect(byTypeTasks).toHaveLength(1);
        expect(byTypeTasks[0]!.title).toBe('Low feature');
        const done = await pool.createTask({ title: 'Done thing' });
        await pool.updateTask(done, { status: 'done' });
        const byStatus = await tool.execute({ status: 'done' });
        const byStatusTasks = parseTasks(byStatus[0]!.result);
        expect(byStatusTasks.map((t) => t.id)).toEqual([done]);
    });

    it('combines filters with the available flag', async () => {
        const pool = new TaskPool();
        const idReady = await pool.createTask({ title: 'Ready high', priority: 'high' });
        const idPending = await pool.createTask({ title: 'Pending high', priority: 'high' });
        const dep = await pool.createTask({ title: 'Dep' });
        await pool.updateTask(idPending, { addDependency: dep });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ available: true, priority: 'high' });
        const tasks = parseTasks(result[0]!.result);
        expect(tasks.map((t) => t.id)).toEqual([idReady]);
    });

    it('rejects invalid filter values', async () => {
        const tool = new ReadTaskTool(new TaskPool());
        const badStatus = await tool.execute({ status: 'bogus' });
        expect(badStatus[0]!.status).toBe(ResultStatus.Error);
        expect(badStatus[0]!.result).toContain('Invalid status filter');
        const badPriority = await tool.execute({ priority: 'urgent' });
        expect(badPriority[0]!.status).toBe(ResultStatus.Error);
        expect(badPriority[0]!.result).toContain('Invalid priority filter');
        const badType = await tool.execute({ type: 'epic' });
        expect(badType[0]!.status).toBe(ResultStatus.Error);
        expect(badType[0]!.result).toContain('Invalid type filter');
    });

    it('lists a truncated preview of long fields', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['x'.repeat(250)]
        });
        await pool.updateTask(id, { history: 'x'.repeat(500) });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({});
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const tasks = parseTasks(result[0]!.result);
        const task = tasks.find((t) => t.id === id)!;
        expect(task.history).toHaveLength(200 + 3);
        expect(task.history.endsWith('...')).toBe(true);
        expect(task.steps![0]!).toHaveLength(200 + 3);
        expect(task.steps![0]!.endsWith('...')).toBe(true);
    });

    it('keeps the full fields when reading a single task', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['y'.repeat(250)]
        });
        await pool.updateTask(id, { history: 'y'.repeat(500) });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ id });
        const task = JSON.parse(result[0]!.result) as SerializedTask;
        expect(task.history).toContain('y'.repeat(500));
        expect(task.steps![0]!).toContain('y'.repeat(250));
        expect(task.steps![0]!).not.toContain('...');
    });

    it('lists all not-done tasks when available is false', async () => {
        const pool = new TaskPool();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { status: 'done' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ available: false });
        const tasks = parseTasks(result[0]!.result);
        expect(tasks.map((t) => t.id)).toEqual([idA]);
    });

    it('rejects id combined with the available flag', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ id, available: true });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('mutually exclusive');
    });

    it('reads a single task by unique shortened id', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ id: id.slice(0, 8) });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = JSON.parse(result[0]!.result) as SerializedTask & { matchedFields?: string[] };
        expect(task.id).toBe(id);
        expect(task.title).toBe('Task A');
        expect(task.matchedFields).toBeUndefined();
    });

    it('reports ambiguous, too-short and not-found for unresolvable ids', async () => {
        const tmpDir = createTempDir();
        try {
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: 'aaaaaaaa-1111-4111-8111-111111111111',
                            title: 'A',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        },
                        {
                            id: 'aaaaaaaa-2222-4222-8222-222222222222',
                            title: 'B',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );
            const tool = new ReadTaskTool(await TaskPool.load(filePath));
            const ambiguous = await tool.execute({ id: 'aaaaaaaa' });
            expect(ambiguous[0]!.status).toBe(ResultStatus.Error);
            expect(ambiguous[0]!.result).toContain('Ambiguous id prefix');
            expect(ambiguous[0]!.result).toContain('aaaaaaaa-1111-4111-8111-111111111111');
            expect(ambiguous[0]!.result).toContain('aaaaaaaa-2222-4222-8222-222222222222');
            const tooShort = await tool.execute({ id: 'abc' });
            expect(tooShort[0]!.status).toBe(ResultStatus.Error);
            expect(tooShort[0]!.result).toContain('at least 8 characters');
            const missing = await tool.execute({ id: 'ffffffff' });
            expect(missing[0]!.status).toBe(ResultStatus.Error);
            expect(missing[0]!.result).toContain('not found');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('rejects query combined with id', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ id, query: 'task' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain("'id' and 'query' are mutually exclusive");
    });

    it('searches listings with a query regex and reports matched fields', async () => {
        const pool = new TaskPool();
        await pool.createTask({ title: 'Add phone validation', steps: ['parse E.164'] });
        await pool.createTask({ title: 'Unrelated task' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ query: 'e\\.164|phone' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const tasks = parseTasks(result[0]!.result) as Array<
            SerializedTask & { matchedFields?: string[] }
        >;
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.title).toBe('Add phone validation');
        expect(tasks[0]!.matchedFields).toEqual(['title', 'steps[0]']);
    });

    it('query can find tasks by partial id and matches history', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Findable' });
        await pool.updateTask(id, { history: 'touched the database layer' });
        await pool.createTask({ title: 'Other' });
        const tool = new ReadTaskTool(pool);
        const byId = await tool.execute({ query: id.slice(0, 8) });
        let tasks = parseTasks(byId[0]!.result) as Array<SerializedTask & { matchedFields?: string[] }>;
        expect(tasks.map((t) => t.id)).toEqual([id]);
        expect(tasks[0]!.matchedFields).toEqual(['id']);
        const byHistory = await tool.execute({ query: 'database layer' });
        tasks = parseTasks(byHistory[0]!.result) as Array<SerializedTask & { matchedFields?: string[] }>;
        expect(tasks.map((t) => t.id)).toEqual([id]);
        expect(tasks[0]!.matchedFields).toEqual(['history']);
    });

    it('combines query with enum filters and the available flag', async () => {
        const pool = new TaskPool();
        const ready = await pool.createTask({ title: 'Ready alpha', priority: 'high' });
        await pool.createTask({ title: 'Low alpha', priority: 'low' });
        const pending = await pool.createTask({ title: 'Pending alpha', priority: 'high' });
        const dep = await pool.createTask({ title: 'Dep' });
        await pool.updateTask(pending, { addDependency: dep });
        const done = await pool.createTask({ title: 'Done alpha' });
        await pool.updateTask(done, { status: 'done' });
        const tool = new ReadTaskTool(pool);
        const byPriority = await tool.execute({ query: 'alpha', priority: 'high' });
        expect(parseTasks(byPriority[0]!.result).map((t) => t.id)).toEqual([ready, pending]);
        const availableOnly = await tool.execute({ query: 'alpha', available: true });
        const availableIds = parseTasks(availableOnly[0]!.result).map((t) => t.id);
        expect(availableIds).toContain(ready);
        expect(availableIds).not.toContain(pending);
        expect(availableIds).not.toContain(done);
        const byStatus = await tool.execute({ query: 'alpha', status: 'done' });
        expect(parseTasks(byStatus[0]!.result).map((t) => t.id)).toEqual([done]);
    });

    it('rejects an invalid query regex and relaxes under strict=false', async () => {
        const tool = new ReadTaskTool(new TaskPool());
        const bad = await tool.execute({ query: '\\"' });
        expect(bad[0]!.status).toBe(ResultStatus.Error);
        expect(bad[0]!.result).toContain('Invalid query regex');
        expect(bad[0]!.result).toContain('strict=false');
        const lenient = await tool.execute({ query: '\\"', strict: false });
        expect(lenient[0]!.status).toBe(ResultStatus.Success);
        expect(parseTasks(lenient[0]!.result)).toEqual([]);
        const broken = await tool.execute({ query: '\\', strict: false });
        expect(broken[0]!.status).toBe(ResultStatus.Error);
        expect(broken[0]!.result).toContain('Invalid query regex');
        expect(broken[0]!.result).not.toContain('strict=false');
    });

    it('ignores a whitespace-only query', async () => {
        const pool = new TaskPool();
        await pool.createTask({ title: 'Task A' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ query: '   ' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const tasks = parseTasks(result[0]!.result) as Array<Record<string, unknown>>;
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.matchedFields).toBeUndefined();
    });

    it('includes the milestone in single-task and listing output', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A', milestone: 'v2-release' });
        await pool.createTask({ title: 'No milestone' });
        const tool = new ReadTaskTool(pool);
        const single = JSON.parse((await tool.execute({ id }))[0]!.result) as SerializedTask;
        expect(single.milestone).toBe('v2-release');
        const listed = parseTasks((await tool.execute({}))[0]!.result).find(
            (t) => t.id === id
          )!;
        expect(listed.milestone).toBe('v2-release');
        const noMilestone = parseTasks((await tool.execute({}))[0]!.result).find(
            (t) => t.title === 'No milestone'
        )!;
        expect(noMilestone.milestone).toBeUndefined();
    });

    it('filters listings by exact milestone after trimming', async () => {
        const pool = new TaskPool();
        const idA = await pool.createTask({ title: 'Task A', milestone: 'v2' });
        await pool.createTask({ title: 'Task B', milestone: 'v3' });
        await pool.createTask({ title: 'Task C' });
        const tool = new ReadTaskTool(pool);
        const byMilestone = await tool.execute({ milestone: ' v2 ' });
        expect(parseTasks(byMilestone[0]!.result).map((t) => t.id)).toEqual([idA]);
        const caseMismatch = await tool.execute({ milestone: 'V2' });
        expect(parseTasks(caseMismatch[0]!.result)).toEqual([]);
        const noMatch = await tool.execute({ milestone: 'nope' });
        expect(parseTasks(noMatch[0]!.result)).toEqual([]);
    });

    it('composes the milestone filter with the other filters', async () => {
        const pool = new TaskPool();
        const ready = await pool.createTask({
            title: 'Ready one',
            priority: 'high',
            milestone: 'v2'
        });
        await pool.createTask({ title: 'Low two', milestone: 'v2' });
        const done = await pool.createTask({ title: 'Done three', milestone: 'v2' });
        await pool.updateTask(done, { status: 'done' });
        const pending = await pool.createTask({ title: 'Pending four', milestone: 'v2' });
        const dep = await pool.createTask({ title: 'Dep' });
        await pool.updateTask(pending, { addDependency: dep });
        const tool = new ReadTaskTool(pool);
        const byPriority = await tool.execute({ milestone: 'v2', priority: 'high' });
        expect(parseTasks(byPriority[0]!.result).map((t) => t.id)).toEqual([ready]);
        const availableOnly = await tool.execute({ milestone: 'v2', available: true });
        const ids = parseTasks(availableOnly[0]!.result).map((t) => t.id);
        expect(ids).toContain(ready);
        expect(ids).not.toContain(pending);
        expect(ids).not.toContain(done);
        const byStatus = await tool.execute({ milestone: 'v2', status: 'done' });
        expect(parseTasks(byStatus[0]!.result).map((t) => t.id)).toEqual([done]);
        const byQuery = await tool.execute({ milestone: 'v2', query: 'ready one' });
        expect(parseTasks(byQuery[0]!.result).map((t) => t.id)).toEqual([ready]);
    });

    it('query matches the milestone field and reports it via matchedFields', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({
            title: 'Ship it',
            milestone: 'spiel-sdk-migration'
        });
        await pool.createTask({ title: 'Unrelated' });
        const tool = new ReadTaskTool(pool);
        const result = await tool.execute({ query: 'migration' });
        const tasks = parseTasks(result[0]!.result) as Array<
            SerializedTask & { matchedFields?: string[] }
        >;
        expect(tasks.map((t) => t.id)).toEqual([id]);
        expect(tasks[0]!.matchedFields).toEqual(['milestone']);
    });
});
