import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID, type UUID } from 'node:crypto';
import { TaskPool } from '../../src/index.js';

describe('TaskPool lookups, availability and dependencies', () => {
    let pool: TaskPool;

    beforeEach(async () => {
        pool = await TaskPool.create();
    });

    it('getTask returns undefined for an unknown id', () => {
        expect(pool.getTask('nonexistent')).toBeUndefined();
    });

    it('getTasks returns all tasks', async () => {
        await pool.createTask({ title: 'Task A' });
        await pool.createTask({ title: 'Task B' });
        const tasks = pool.getTasks();
        expect(tasks).toHaveLength(2);
    });

    it('getAvailableTasks returns ready tasks without dependencies', async () => {
        await pool.createTask({ title: 'Task A' });
        await pool.createTask({ title: 'Task B' });
        const available = pool.getAvailableTasks();
        expect(available).toHaveLength(2);
    });

    it('getAvailableTasks excludes done tasks', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { status: 'done' });
        expect(pool.getAvailableTasks()).toHaveLength(0);
    });

    it('getAvailableTasks excludes tasks with unfinished dependencies', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        const available = pool.getAvailableTasks();
        expect(available).toHaveLength(1);
        expect(available[0]!.id).toBe(idA);
    });

    it('getAvailableTasks includes a task whose dependencies are all done', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await pool.updateTask(idA, { status: 'done' });
        const available = pool.getAvailableTasks();
        expect(available.map((t) => t.id)).toContain(idB);
    });

    it('getAvailableTasks includes in_progress tasks', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await pool.updateTask(id, { status: 'in_progress' });
        const available = pool.getAvailableTasks();
        expect(available.map((t) => t.id)).toContain(id);
    });

    it('getUnfinishedDependencyIds reports unfinished dependency ids', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        expect(pool.getUnfinishedDependencyIds(idB)).toEqual([idA]);
        await pool.updateTask(idA, { status: 'done' });
        expect(pool.getUnfinishedDependencyIds(idB)).toEqual([]);
        expect(pool.getUnfinishedDependencyIds('nonexistent')).toEqual([]);
    });

    it('updateTask adds a dependency between tasks', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        const taskB = pool.getTask(idB)!;
        expect(taskB.dependencies).toHaveLength(1);
        expect(taskB.dependencies[0]).toBe(idA);
    });

    it('updateTask sets a task to pending when adding an unfinished dependency', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        expect(pool.getTask(idB)!.status).toBe('pending');
        expect(pool.getTask(idA)!.status).toBe('ready');
    });

    it('updateTask keeps status when adding a finished dependency', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idA, { status: 'done' });
        await pool.updateTask(idB, { addDependency: idA });
        expect(pool.getTask(idB)!.status).toBe('ready');
    });

    it('updateTask rejects adding a dependency to a done task', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { status: 'done' });
        await expect(pool.updateTask(idB, { addDependency: idA })).rejects.toThrow(
            'cannot gain new dependencies',
        );
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('updateTask rejects adding a dependency to an in_progress task', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { status: 'in_progress' });
        await expect(pool.updateTask(idB, { addDependency: idA })).rejects.toThrow(
            'cannot gain new dependencies',
        );
        expect(pool.getTask(idB)!.status).toBe('in_progress');
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('updateTask throws for a missing task', async () => {
        await expect(pool.updateTask('nonexistent', {})).rejects.toThrow('not found');
    });

    it('updateTask throws when status and addDependency are both set', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await expect(pool.updateTask(idB, { status: 'done', addDependency: idA })).rejects.toThrow(
            'mutually exclusive',
        );
    });

    it('updateTask throws when status and removeDependency are both set', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await expect(
            pool.updateTask(idB, { status: 'ready', removeDependency: idA }),
        ).rejects.toThrow('mutually exclusive');
        expect(pool.getTask(idB)!.dependencies).toEqual([idA]);
    });

    it('updateTask throws when addDependency and removeDependency are both set', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await expect(
            pool.updateTask(idB, { addDependency: idA, removeDependency: idA }),
        ).rejects.toThrow('mutually exclusive');
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('updateTask removes a dependency and derives readiness', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        expect(pool.getTask(idB)!.status).toBe('pending');
        await pool.updateTask(idB, { removeDependency: idA });
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
        expect(pool.getTask(idB)!.status).toBe('ready');
    });

    it('updateTask removes only the named dependency', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        await pool.updateTask(idC, { addDependency: idA });
        await pool.updateTask(idC, { addDependency: idB });
        await pool.updateTask(idC, { removeDependency: idA });
        expect(pool.getTask(idC)!.dependencies).toEqual([idB]);
        expect(pool.getTask(idC)!.status).toBe('pending');
    });

    it('updateTask rejects removing a dependency that is not present', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await expect(pool.updateTask(idB, { removeDependency: idA })).rejects.toThrow(
            'does not depend on',
        );
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('updateTask allows removing a dependency from an in_progress task', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await pool.updateTask(idA, { status: 'done' });
        await pool.updateTask(idB, { status: 'in_progress' });
        await pool.updateTask(idB, { removeDependency: idA });
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
        expect(pool.getTask(idB)!.status).toBe('in_progress');
    });

    it('updateTask throws for a missing dependency task', async () => {
        const idB = await pool.createTask({ title: 'Task B' });
        const missing = randomUUID();
        await expect(pool.updateTask(idB, { addDependency: missing })).rejects.toThrow('not found');
    });

    it('updateTask rejects a malformed dependency id', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await expect(pool.updateTask(idB, { addDependency: 'not-a-uuid' as UUID })).rejects.toThrow(
            'must be a UUID',
        );
        await expect(
            pool.updateTask(idB, { removeDependency: 'not-a-uuid' as UUID }),
        ).rejects.toThrow('must be a UUID');
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
        expect(pool.getTask(idA)!.dependencies).toEqual([]);
    });

    it('updateTask rejects a task depending on itself', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        await expect(pool.updateTask(idA, { addDependency: idA })).rejects.toThrow('itself');
        expect(pool.getTask(idA)!.dependencies).toHaveLength(0);
    });

    it('updateTask rejects a duplicate dependency', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await expect(pool.updateTask(idB, { addDependency: idA })).rejects.toThrow(
            'already depends on',
        );
    });

    it('updateTask prevents cycles', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await expect(pool.updateTask(idA, { addDependency: idB })).rejects.toThrow('cyclic');
    });
});
