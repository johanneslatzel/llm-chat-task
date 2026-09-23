import { describe, it, expect } from 'vitest';
import { TaskPool, UpdateTaskTool } from '../../src/index.js';
import { ResultStatus } from '@johannes.latzel/llm-chat';

describe('UpdateTaskTool dependency removal', () => {
    it('removes a dependency and derives readiness', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        expect(pool.getTask(idB)!.status).toBe('pending');
        const result = await tool.execute({ id: idB, remove_dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('no longer depends on ' + idA);
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
        expect(pool.getTask(idB)!.status).toBe('ready');
    });

    it('removes a dependency referenced by shortened id', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        const result = await tool.execute({
            id: idB.slice(0, 8),
            remove_dependency_id: idA.slice(0, 8),
        });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('no longer depends on ' + idA);
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('keeps other dependencies when removing one', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idC = await pool.createTask({ title: 'Task C' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        await tool.execute({ id: idB, dependency_id: idC });
        const result = await tool.execute({ id: idB, remove_dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(pool.getTask(idB)!.dependencies).toEqual([idC]);
        expect(pool.getTask(idB)!.status).toBe('pending');
    });

    it('removes the last unfinished dependency even when another is done', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idC = await pool.createTask({ title: 'Task C' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        await tool.execute({ id: idB, dependency_id: idC });
        await tool.execute({ id: idA, status: 'done' });
        expect(pool.getTask(idB)!.status).toBe('pending');
        const result = await tool.execute({ id: idB, remove_dependency_id: idC });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(pool.getTask(idB)!.dependencies).toEqual([idA]);
        expect(pool.getTask(idB)!.status).toBe('ready');
    });

    it('allows removing a dependency from an in_progress or done task', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        await tool.execute({ id: idA, status: 'done' });
        await tool.execute({ id: idB, status: 'in_progress' });
        const result = await tool.execute({ id: idB, remove_dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
        expect(pool.getTask(idB)!.status).toBe('in_progress');
    });

    it('rejects removing a dependency the task does not have', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id: idB, remove_dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('does not depend on');
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('rejects remove_dependency_id combined with status', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        await tool.execute({ id: idB, dependency_id: idA });
        const result = await tool.execute({ id: idB, status: 'done', remove_dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('mutually exclusive');
        expect(pool.getTask(idB)!.dependencies).toEqual([idA]);
    });

    it('rejects add and remove of a dependency in one call', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({
            id: idB,
            dependency_id: idA,
            remove_dependency_id: idA,
        });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('mutually exclusive');
    });

    it('reports unresolvable remove_dependency_id without changing the task', async () => {
        const pool = await TaskPool.create();
        const idA = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const tooShort = await tool.execute({ id: idA, remove_dependency_id: 'abc' });
        expect(tooShort[0]!.status).toBe(ResultStatus.Error);
        expect(tooShort[0]!.result).toContain('at least 8 characters');
        const missing = await tool.execute({ id: idA, remove_dependency_id: 'ffffffff' });
        expect(missing[0]!.status).toBe(ResultStatus.Error);
        expect(missing[0]!.result).toContain('not found');
        expect(pool.getTask(idA)!.dependencies).toEqual([]);
    });
});
