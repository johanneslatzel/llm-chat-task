import { describe, it, expect } from 'vitest';
import { TaskPool, ReadTaskTool } from '../../src/index.js';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import type { Task } from '../../src/types.js';

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
});
