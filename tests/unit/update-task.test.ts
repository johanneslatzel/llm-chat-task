import { describe, it, expect, vi } from 'vitest';
import { TaskPool, UpdateTaskTool } from '../../src/index.js';
import { ResultStatus } from '@johannes.latzel/llm-chat';

describe('UpdateTaskTool', () => {
    it('reports a missing id', async () => {
        const tool = new UpdateTaskTool(new TaskPool());
        const result = await tool.execute({});
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('id');
    });

    it('reports a non-string id', async () => {
        const tool = new UpdateTaskTool(new TaskPool());
        const result = await tool.execute({ id: 42 });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('id');
    });

    it('sets a task status', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, status: 'in_progress' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('status: in_progress');
        expect(pool.getTask(id)!.status).toBe('in_progress');
    });

    it('marks a task done with a progress entry', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, status: 'done', history: 'all done' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('status: done');
        expect(result[0]!.result).toContain('progress entry recorded');
        const task = pool.getTask(id)!;
        expect(task.status).toBe('done');
        expect(task.history).toMatch(/^\[.+\] all done$/);
    });

    it('updates a task title', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Old name' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, title: 'New name' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('title updated');
        expect(pool.getTask(id)!.title).toBe('New name');
    });

    it('updates a task description', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A', description: 'old' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, description: 'New name' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('description updated');
        expect(pool.getTask(id)!.description).toBe('New name');
    });

    it('updates structured fields and reports each change', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({
            id,
            acceptance_criteria: ['a', 'b'],
            priority: 'medium',
            type: 'chore',
            links: ['https://example.com'],
            steps: ['s1'],
            context: ['c1'],
            constraints: ['x1'],
            out_of_scope: ['o1'],
            verification: ['v1'],
            edge_cases: ['e1']
        });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('acceptance criteria updated');
        expect(result[0]!.result).toContain('priority updated');
        expect(result[0]!.result).toContain('type updated');
        expect(result[0]!.result).toContain('links updated');
        expect(result[0]!.result).toContain('steps updated');
        expect(result[0]!.result).toContain('context updated');
        expect(result[0]!.result).toContain('constraints updated');
        expect(result[0]!.result).toContain('out-of-scope updated');
        expect(result[0]!.result).toContain('verification updated');
        expect(result[0]!.result).toContain('edge cases updated');
        const task = pool.getTask(id)!;
        expect(task.acceptanceCriteria).toEqual(['a', 'b']);
        expect(task.priority).toBe('medium');
        expect(task.type).toBe('chore');
        expect(task.links).toEqual(['https://example.com']);
        expect(task.steps).toEqual(['s1']);
        expect(task.context).toEqual(['c1']);
        expect(task.constraints).toEqual(['x1']);
        expect(task.outOfScope).toEqual(['o1']);
        expect(task.verification).toEqual(['v1']);
        expect(task.edgeCases).toEqual(['e1']);
    });

    it('combines a status change with a title update', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Old name' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, status: 'in_progress', title: 'New name' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('status: in_progress');
        expect(result[0]!.result).toContain('title updated');
        expect(pool.getTask(id)!.title).toBe('New name');
        expect(pool.getTask(id)!.status).toBe('in_progress');
    });

    it('surfaces title validation errors', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const empty = await tool.execute({ id, title: '  ' });
        expect(empty[0]!.status).toBe(ResultStatus.Error);
        expect(empty[0]!.result).toContain('Title must not be empty');
        const long = await tool.execute({ id, title: 'x'.repeat(101) });
        expect(long[0]!.status).toBe(ResultStatus.Error);
        expect(long[0]!.result).toContain('Title must be at most 100 characters');
    });

    it('surfaces description validation errors', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A', description: 'd' });
        const tool = new UpdateTaskTool(pool);
        const empty = await tool.execute({ id, description: '  ' });
        expect(empty[0]!.status).toBe(ResultStatus.Error);
        expect(empty[0]!.result).toContain('Description must not be empty');
        const long = await tool.execute({ id, description: 'x'.repeat(501) });
        expect(long[0]!.status).toBe(ResultStatus.Error);
        expect(long[0]!.result).toContain('Description must be at most 500 characters');
    });

    it('surfaces structured-field validation errors', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const badLink = await tool.execute({ id, links: ['nope'] });
        expect(badLink[0]!.status).toBe(ResultStatus.Error);
        expect(badLink[0]!.result).toContain('Links items must be valid URLs');
        const badPriority = await tool.execute({ id, priority: 'urgent' });
        expect(badPriority[0]!.status).toBe(ResultStatus.Error);
        expect(badPriority[0]!.result).toContain('Invalid priority');
        const tooMany = await tool.execute({
            id,
            acceptance_criteria: Array.from({ length: 11 }, () => 'c')
        });
        expect(tooMany[0]!.status).toBe(ResultStatus.Error);
        expect(tooMany[0]!.result).toContain('Acceptance criteria must have at most 10 items');
    });

    it('surfaces progress log oversize errors', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, history: 'x'.repeat(10_001) });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('task log would exceed 10000 characters');
    });

    it('adds a dependency', async () => {
        const pool = new TaskPool();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id: idB, dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('now depends on ' + idA);
        expect(pool.getTask(idB)!.dependencies).toEqual([idA]);
        expect(pool.getTask(idB)!.status).toBe('pending');
    });

    it('rejects an invalid status', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, status: 'bogus' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('Invalid status');
    });

    it('rejects the derived pending status', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id, status: 'pending' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('derived');
    });

    it('rejects status combined with dependency_id', async () => {
        const pool = new TaskPool();
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id: idB, status: 'done', dependency_id: idA });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('mutually exclusive');
    });

    it('ignores non-string optional parameters', async () => {
        const pool = new TaskPool();
        const id = await pool.createTask({ title: 'Task A' });
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({
            id,
            status: 42,
            history: 7,
            dependency_id: 9,
            title: 5,
            description: {},
            priority: [],
            acceptance_criteria: 'nope',
            steps: 0
        });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('status: ready');
        const task = pool.getTask(id)!;
        expect(task.status).toBe('ready');
        expect(task.title).toBe('Task A');
        expect(task.history).toBe('');
        expect(task.dependencies).toEqual([]);
        expect(task.description).toBeUndefined();
        expect(task.priority).toBeUndefined();
        expect(task.acceptanceCriteria).toBeUndefined();
        expect(task.steps).toBeUndefined();
    });

    it('surfaces pool errors', async () => {
        const pool = new TaskPool();
        vi.spyOn(pool, 'updateTask').mockRejectedValueOnce(new Error('pool failure'));
        const tool = new UpdateTaskTool(pool);
        const result = await tool.execute({ id: 'some-id', status: 'done' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toBe('pool failure');
    });
});
