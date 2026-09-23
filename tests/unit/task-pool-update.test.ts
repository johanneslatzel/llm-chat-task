import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPool } from '../../src/index.js';

describe('TaskPool.updateTask fields, validation and status', () => {
    let pool: TaskPool;

    beforeEach(async () => {
        pool = await TaskPool.create();
    });

    it('updateTask transitions a task through statuses', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        let task = await pool.updateTask(id, { status: 'in_progress' });
        expect(task.status).toBe('in_progress');
        task = await pool.updateTask(id, { status: 'done', history: 'Result data' });
        expect(task.status).toBe('done');
        expect(task.history).toContain('Result data');
    });

    it('updateTask appends a timestamped progress entry', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const task = await pool.updateTask(id, { history: 'note' });
        expect(task.status).toBe('ready');
        expect(task.history).toMatch(/^\[.+\] note$/);
    });

    it('updateTask accumulates progress entries separated by newlines', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { history: 'first' });
        await pool.updateTask(id, { history: 'second' });
        const log = pool.getTask(id)!.history;
        const entries = log.split('\n');
        expect(entries).toHaveLength(2);
        expect(entries[0]!).toMatch(/^\[.+\] first$/);
        expect(entries[1]!).toMatch(/^\[.+\] second$/);
    });

    it('updateTask rejects a progress entry that would exceed the log cap', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { history: 'a'.repeat(5000) });
        const before = pool.getTask(id)!.history;
        await expect(pool.updateTask(id, { history: 'b'.repeat(6000) })).rejects.toThrow(
            'task log would exceed 10000 characters',
        );
        expect(pool.getTask(id)!.history).toBe(before);
    });

    it('updateTask updates the title and trims it', async () => {
        const id = await pool.createTask({ title: 'Old name' });
        const task = await pool.updateTask(id, { title: '  New name  ' });
        expect(task.title).toBe('New name');
        expect(pool.getTask(id)!.title).toBe('New name');
    });

    it('updateTask rejects an empty or over-long title', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(id, { title: '  ' })).rejects.toThrow(
            'Title must not be empty',
        );
        await expect(pool.updateTask(id, { title: 'z'.repeat(101) })).rejects.toThrow(
            'Title must be at most 100 characters',
        );
        expect(pool.getTask(id)!.title).toBe('Task A');
    });

    it('updateTask updates the description', async () => {
        const id = await pool.createTask({ title: 'Task A', description: 'Old desc' });
        const task = await pool.updateTask(id, { description: '  New desc  ' });
        expect(task.description).toBe('New desc');
    });

    it('updateTask rejects an empty or over-long description', async () => {
        const id = await pool.createTask({ title: 'Task A', description: 'desc' });
        await expect(pool.updateTask(id, { description: '  ' })).rejects.toThrow(
            'Description must not be empty',
        );
        await expect(pool.updateTask(id, { description: 'y'.repeat(501) })).rejects.toThrow(
            'Description must be at most 500 characters',
        );
        expect(pool.getTask(id)!.description).toBe('desc');
    });

    it('updateTask sets and trims the milestone', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const task = await pool.updateTask(id, { milestone: '  release-1  ' });
        expect(task.milestone).toBe('release-1');
    });

    it('updateTask clears the milestone with an empty value', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'release-1' });
        await pool.updateTask(id, { milestone: '' });
        const task = pool.getTask(id)!;
        expect(task.milestone).toBeUndefined();
        expect('milestone' in task).toBe(false);
    });

    it('updateTask clears the milestone when the value is whitespace-only', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'release-1' });
        await pool.updateTask(id, { milestone: '   ' });
        expect(pool.getTask(id)!.milestone).toBeUndefined();
    });

    it('updateTask clearing an unset milestone is a no-op', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const task = await pool.updateTask(id, { milestone: '   ' });
        expect(task.milestone).toBeUndefined();
        expect(task.title).toBe('Task A');
    });

    it('updateTask keeps the existing milestone when not provided', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'release-1' });
        await pool.updateTask(id, { history: 'note' });
        expect(pool.getTask(id)!.milestone).toBe('release-1');
    });

    it('updateTask rejects an over-long milestone before applying changes', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'release-1' });
        await expect(
            pool.updateTask(id, { milestone: 'm'.repeat(65), title: 'Changed' }),
        ).rejects.toThrow('Milestone must be at most 64 characters (got 65)');
        expect(pool.getTask(id)!.title).toBe('Task A');
        expect(pool.getTask(id)!.milestone).toBe('release-1');
    });

    it('updateTask accepts a milestone at exactly the max length on update', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { milestone: 'm'.repeat(64) });
        expect(pool.getTask(id)!.milestone).toHaveLength(64);
    });

    it('updateTask rejects a non-string milestone', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(id, { milestone: 42 } as never)).rejects.toThrow(
            'Milestone must be a string',
        );
        expect(pool.getTask(id)!.milestone).toBeUndefined();
    });

    it('updateTask rejects invalid milestone values before applying changes', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'release-1' });
        await expect(
            pool.updateTask(id, { milestone: 'bad label', title: 'Changed' }),
        ).rejects.toThrow('Milestone must not contain whitespace');
        await expect(
            pool.updateTask(id, { milestone: 'café', title: 'Changed again' }),
        ).rejects.toThrow('Milestone must contain only ASCII characters');
        expect(pool.getTask(id)!.title).toBe('Task A');
        expect(pool.getTask(id)!.milestone).toBe('release-1');
    });

    it('updateTask replaces acceptance criteria as a whole array', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            acceptanceCriteria: ['old one', 'old two'],
        });
        await pool.updateTask(id, { acceptanceCriteria: ['new one'] });
        expect(pool.getTask(id)!.acceptanceCriteria).toEqual(['new one']);
    });

    it('updateTask validates acceptance criteria on update', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(
            pool.updateTask(id, { acceptanceCriteria: Array.from({ length: 11 }, () => 'c') }),
        ).rejects.toThrow('Acceptance criteria must have at most 10 items');
        await expect(
            pool.updateTask(id, { acceptanceCriteria: ['c'.repeat(201)] }),
        ).rejects.toThrow('Acceptance criteria items must be at most 200 characters');
        expect(pool.getTask(id)!.acceptanceCriteria).toBeUndefined();
    });

    it('updateTask updates priority and type', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { priority: 'high', type: 'refactor' });
        const task = pool.getTask(id)!;
        expect(task.priority).toBe('high');
        expect(task.type).toBe('refactor');
    });

    it('updateTask rejects an invalid priority and type', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(id, { priority: 'x' } as never)).rejects.toThrow(
            'Invalid priority',
        );
        await expect(pool.updateTask(id, { type: 'x' } as never)).rejects.toThrow('Invalid type');
        expect(pool.getTask(id)!.priority).toBe('low');
        expect(pool.getTask(id)!.type).toBeUndefined();
    });

    it('updateTask replaces links and validates URLs', async () => {
        const id = await pool.createTask({ title: 'Task A', links: ['https://old.example'] });
        await pool.updateTask(id, { links: ['https://new.example'] });
        expect(pool.getTask(id)!.links).toEqual(['https://new.example']);
        await expect(pool.updateTask(id, { links: ['not-a-url'] })).rejects.toThrow(
            'Links items must be valid URLs',
        );
    });

    it('updateTask replaces plan arrays', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['old step'],
            constraints: ['old constraint'],
            outOfScope: ['old'],
            verification: ['old verify'],
            context: ['old context'],
            edgeCases: ['old edge'],
        });
        await pool.updateTask(id, {
            steps: ['new step'],
            constraints: ['new constraint'],
            outOfScope: ['new'],
            verification: ['new verify'],
            context: ['new context'],
            edgeCases: ['new edge'],
        });
        const task = pool.getTask(id)!;
        expect(task.steps).toEqual(['new step']);
        expect(task.constraints).toEqual(['new constraint']);
        expect(task.outOfScope).toEqual(['new']);
        expect(task.verification).toEqual(['new verify']);
        expect(task.context).toEqual(['new context']);
        expect(task.edgeCases).toEqual(['new edge']);
    });

    it('updateTask validates plan arrays on update', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(
            pool.updateTask(id, { steps: Array.from({ length: 21 }, () => 's') }),
        ).rejects.toThrow('Steps must have at most 20 items');
        await expect(pool.updateTask(id, { context: ['c'.repeat(301)] })).rejects.toThrow(
            'Context items must be at most 300 characters',
        );
        await expect(pool.updateTask(id, { edgeCases: [' '] })).rejects.toThrow(
            'Edge cases items must not be empty',
        );
        expect(pool.getTask(id)!.steps).toBeUndefined();
    });

    it('updateTask validates all changes before applying any', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(id, { description: '  ', status: 'done' })).rejects.toThrow(
            'Description must not be empty',
        );
        expect(pool.getTask(id)!.status).toBe('ready');
        await expect(
            pool.updateTask(id, { status: 'done', history: 'x'.repeat(10_001) }),
        ).rejects.toThrow('task log would exceed');
        expect(pool.getTask(id)!.status).toBe('ready');
        expect(pool.getTask(id)!.history).toBe('');
        await expect(
            pool.updateTask(id, { priority: 'bogus' as never, title: 'Changed' }),
        ).rejects.toThrow('Invalid priority');
        expect(pool.getTask(id)!.title).toBe('Task A');
    });

    it('updateTask combines a title update with a status change', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { title: 'Renamed', status: 'in_progress' });
        expect(pool.getTask(id)!.title).toBe('Renamed');
        expect(pool.getTask(id)!.status).toBe('in_progress');
    });

    it('updateTask reopens a done task as ready', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { status: 'done' });
        const task = await pool.updateTask(id, { status: 'ready' });
        expect(task.status).toBe('ready');
    });

    it('updateTask rejects status pending as derived', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(id, { status: 'pending' })).rejects.toThrow('derived');
    });

    it('updateTask rejects status changes while dependencies are unfinished', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await expect(pool.updateTask(idB, { status: 'done' })).rejects.toThrow('dependencies');
        expect(pool.getTask(idB)!.status).toBe('pending');
    });

    it('derives ready once all dependencies finish', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        expect(pool.getTask(idB)!.status).toBe('pending');
        await pool.updateTask(idA, { status: 'done' });
        expect(pool.getTask(idB)!.status).toBe('ready');
    });

    it('keeps a pending task pending while other updates do not finish its dependencies', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        await pool.updateTask(idB, { addDependency: idA });
        await pool.updateTask(idC, { history: 'unrelated' });
        expect(pool.getTask(idB)!.status).toBe('pending');
    });
});
