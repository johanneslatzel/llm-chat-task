import { describe, it, expect, beforeEach } from 'vitest';
import type { UUID } from 'crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TaskPool, TaskConfiguration } from '../../src/index.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

describe('TaskPool', () => {
    let pool: TaskPool;

    beforeEach(() => {
        pool = new TaskPool();
    });

    it('creates a task and returns its id', async () => {
        const id = await pool.createTask({ title: 'Do something' });
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
    });

    it('creates a task in ready status with its title', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const task = pool.getTask(id)!;
        expect(task.status).toBe('ready');
        expect(task.title).toBe('Task A');
        expect(task.description).toBeUndefined();
        expect(task.history).toBe('');
        expect(task.dependencies).toEqual([]);
    });

    it('createTask trims the title', async () => {
        const id = await pool.createTask({ title: '  Do something  ' });
        expect(pool.getTask(id)!.title).toBe('Do something');
    });

    it('createTask rejects an empty title', async () => {
        await expect(pool.createTask({ title: '' })).rejects.toThrow('Title must not be empty');
        await expect(pool.createTask({ title: '   ' })).rejects.toThrow('Title must not be empty');
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask rejects a title over the max length', async () => {
        await expect(pool.createTask({ title: 'x'.repeat(101) })).rejects.toThrow(
            'Title must be at most 100 characters'
        );
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask stores a description', async () => {
        const id = await pool.createTask({ title: 'Task A', description: '  Why this matters  ' });
        expect(pool.getTask(id)!.description).toBe('Why this matters');
    });

    it('createTask rejects an empty description', async () => {
        await expect(pool.createTask({ title: 'Task A', description: '   ' })).rejects.toThrow(
            'Description must not be empty'
        );
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask rejects a description over the max length', async () => {
        await expect(
            pool.createTask({ title: 'Task A', description: 'y'.repeat(501) })
        ).rejects.toThrow('Description must be at most 500 characters');
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask stores and trims acceptance criteria', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            acceptanceCriteria: ['  criterion one  ', 'criterion two']
        });
        expect(pool.getTask(id)!.acceptanceCriteria).toEqual(['criterion one', 'criterion two']);
    });

    it('createTask rejects too many acceptance criteria', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: Array.from({ length: 11 }, () => 'c') })
        ).rejects.toThrow('Acceptance criteria must have at most 10 items');
    });

    it('createTask rejects an acceptance criterion over the item length', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: ['c'.repeat(201)] })
        ).rejects.toThrow('Acceptance criteria items must be at most 200 characters');
    });

    it('createTask rejects an empty acceptance criterion', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: ['   '] })
        ).rejects.toThrow('Acceptance criteria items must not be empty');
    });

    it('createTask rejects non-array and non-string acceptance criteria', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: 'not-an-array' } as never)
        ).rejects.toThrow('Acceptance criteria must be an array of strings');
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: [42] } as never)
        ).rejects.toThrow('Acceptance criteria items must be strings');
    });

    it('createTask stores priority and type', async () => {
        const id = await pool.createTask({ title: 'Task A', priority: 'high', type: 'bug' });
        const task = pool.getTask(id)!;
        expect(task.priority).toBe('high');
        expect(task.type).toBe('bug');
    });

    it('createTask rejects an invalid priority', async () => {
        await expect(
            pool.createTask({ title: 'Task A', priority: 'urgent' } as never)
        ).rejects.toThrow("Invalid priority 'urgent'. Allowed values: low, medium, high");
    });

    it('createTask rejects an invalid type', async () => {
        await expect(
            pool.createTask({ title: 'Task A', type: 'epic' } as never)
        ).rejects.toThrow(
            "Invalid type 'epic'. Allowed values: feature, bug, refactor, chore, research"
        );
    });

    it('createTask stores and trims links', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            links: ['  https://example.com/a  ', 'https://example.com/b']
        });
        expect(pool.getTask(id)!.links).toEqual(['https://example.com/a', 'https://example.com/b']);
    });

    it('createTask rejects an invalid link URL', async () => {
        await expect(
            pool.createTask({ title: 'Task A', links: ['not-a-url'] })
        ).rejects.toThrow('Links items must be valid URLs');
    });

    it('createTask rejects too many links', async () => {
        const links = Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`);
        await expect(pool.createTask({ title: 'Task A', links })).rejects.toThrow(
            'Links must have at most 20 items'
        );
    });

    it('createTask rejects non-string and empty links', async () => {
        await expect(
            pool.createTask({ title: 'Task A', links: [42] } as never)
        ).rejects.toThrow('Links items must be strings');
        await expect(
            pool.createTask({ title: 'Task A', links: ['  '] })
        ).rejects.toThrow('Links items must not be empty');
        await expect(
            pool.createTask({ title: 'Task A', links: 'nope' } as never)
        ).rejects.toThrow('Links must be an array of strings');
    });

    it('createTask stores the plan arrays', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['step one', 'step two'],
            constraints: ['no new deps', 'match the pattern'],
            outOfScope: ['no frontend'],
            verification: ['npm run verify'],
            context: ['src/foo.ts is the entry point'],
            edgeCases: ['empty input is valid']
        });
        const task = pool.getTask(id)!;
        expect(task.steps).toEqual(['step one', 'step two']);
        expect(task.constraints).toEqual(['no new deps', 'match the pattern']);
        expect(task.outOfScope).toEqual(['no frontend']);
        expect(task.verification).toEqual(['npm run verify']);
        expect(task.context).toEqual(['src/foo.ts is the entry point']);
        expect(task.edgeCases).toEqual(['empty input is valid']);
    });

    it('createTask trims plan array items', async () => {
        const id = await pool.createTask({ title: 'Task A', steps: ['  step  '] });
        expect(pool.getTask(id)!.steps).toEqual(['step']);
    });

    it('createTask enforces plan array count and item length limits', async () => {
        const items = Array.from({ length: 21 }, () => 'step');
        await expect(pool.createTask({ title: 'Task A', steps: items })).rejects.toThrow(
            'Steps must have at most 20 items'
        );
        await expect(
            pool.createTask({ title: 'Task A', constraints: ['c'.repeat(301)] })
        ).rejects.toThrow('Constraints items must be at most 300 characters');
        await expect(
            pool.createTask({ title: 'Task A', outOfScope: [' '] })
        ).rejects.toThrow('Out of scope items must not be empty');
        await expect(
            pool.createTask({ title: 'Task A', verification: 'nope' } as never)
        ).rejects.toThrow('Verification must be an array of strings');
        await expect(
            pool.createTask({ title: 'Task A', context: [7] } as never)
        ).rejects.toThrow('Context items must be strings');
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
            'cannot gain new dependencies'
        );
        expect(pool.getTask(idB)!.dependencies).toEqual([]);
    });

    it('updateTask rejects adding a dependency to an in_progress task', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { status: 'in_progress' });
        await expect(pool.updateTask(idB, { addDependency: idA })).rejects.toThrow(
            'cannot gain new dependencies'
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
            'mutually exclusive'
        );
    });

    it('updateTask throws for a missing dependency task', async () => {
        const idB = await pool.createTask({ title: 'Task B' });
        await expect(pool.updateTask(idB, { addDependency: 'nonexistent' })).rejects.toThrow(
            'not found'
        );
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
            'already depends on'
        );
    });

    it('updateTask prevents cycles', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        await expect(pool.updateTask(idA, { addDependency: idB })).rejects.toThrow('cyclic');
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
            'task log would exceed 10000 characters'
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
            'Title must not be empty'
        );
        await expect(pool.updateTask(id, { title: 'z'.repeat(101) })).rejects.toThrow(
            'Title must be at most 100 characters'
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
            'Description must not be empty'
        );
        await expect(pool.updateTask(id, { description: 'y'.repeat(501) })).rejects.toThrow(
            'Description must be at most 500 characters'
        );
        expect(pool.getTask(id)!.description).toBe('desc');
    });

    it('updateTask replaces acceptance criteria as a whole array', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            acceptanceCriteria: ['old one', 'old two']
        });
        await pool.updateTask(id, { acceptanceCriteria: ['new one'] });
        expect(pool.getTask(id)!.acceptanceCriteria).toEqual(['new one']);
    });

    it('updateTask validates acceptance criteria on update', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(
            pool.updateTask(id, { acceptanceCriteria: Array.from({ length: 11 }, () => 'c') })
        ).rejects.toThrow('Acceptance criteria must have at most 10 items');
        await expect(
            pool.updateTask(id, { acceptanceCriteria: ['c'.repeat(201)] })
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
            'Invalid priority'
        );
        await expect(pool.updateTask(id, { type: 'x' } as never)).rejects.toThrow('Invalid type');
        expect(pool.getTask(id)!.priority).toBeUndefined();
        expect(pool.getTask(id)!.type).toBeUndefined();
    });

    it('updateTask replaces links and validates URLs', async () => {
        const id = await pool.createTask({ title: 'Task A', links: ['https://old.example'] });
        await pool.updateTask(id, { links: ['https://new.example'] });
        expect(pool.getTask(id)!.links).toEqual(['https://new.example']);
        await expect(
            pool.updateTask(id, { links: ['not-a-url'] })
        ).rejects.toThrow('Links items must be valid URLs');
    });

    it('updateTask replaces plan arrays', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['old step'],
            constraints: ['old constraint'],
            outOfScope: ['old'],
            verification: ['old verify'],
            context: ['old context'],
            edgeCases: ['old edge']
        });
        await pool.updateTask(id, {
            steps: ['new step'],
            constraints: ['new constraint'],
            outOfScope: ['new'],
            verification: ['new verify'],
            context: ['new context'],
            edgeCases: ['new edge']
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
            pool.updateTask(id, { steps: Array.from({ length: 21 }, () => 's') })
        ).rejects.toThrow('Steps must have at most 20 items');
        await expect(pool.updateTask(id, { context: ['c'.repeat(301)] })).rejects.toThrow(
            'Context items must be at most 300 characters'
        );
        await expect(pool.updateTask(id, { edgeCases: [' '] })).rejects.toThrow(
            'Edge cases items must not be empty'
        );
        expect(pool.getTask(id)!.steps).toBeUndefined();
    });

    it('updateTask validates all changes before applying any', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        await expect(
            pool.updateTask(id, { description: '  ', status: 'done' })
        ).rejects.toThrow('Description must not be empty');
        expect(pool.getTask(id)!.status).toBe('ready');
        await expect(
            pool.updateTask(id, { status: 'done', history: 'x'.repeat(10_001) })
        ).rejects.toThrow('task log would exceed');
        expect(pool.getTask(id)!.status).toBe('ready');
        expect(pool.getTask(id)!.history).toBe('');
        await expect(
            pool.updateTask(id, { priority: 'bogus' as never, title: 'Changed' })
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

    it('clear removes all tasks', async () => {
        await pool.createTask({ title: 'Task A' });
        await pool.createTask({ title: 'Task B' });
        pool.clear();
        expect(pool.getTasks()).toHaveLength(0);
        expect(pool.getAvailableTasks()).toHaveLength(0);
    });

    it('save writes tasks with all fields to a file', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Save me A' });
            const idB = await pool.createTask({
                title: 'Save me B',
                description: 'a description',
                acceptanceCriteria: ['criterion'],
                priority: 'high',
                type: 'feature',
                links: ['https://example.com'],
                steps: ['step'],
                constraints: ['constraint'],
                outOfScope: ['out'],
                verification: ['verify'],
                context: ['context'],
                edgeCases: ['edge']
            });
            await pool.updateTask(idB, { addDependency: idA });
            await pool.updateTask(idA, { status: 'done', history: 'data' });
            const filePath = path.join(tmpDir, 'saved-tasks.json');
            await pool.save(filePath);
            const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
                tasks: Array<Record<string, unknown>>;
            };
            expect(raw.tasks).toHaveLength(2);
            const taskB = raw.tasks.find((t) => t.id === idB)!;
            expect(taskB.title).toBe('Save me B');
            expect(taskB.description).toBe('a description');
            expect(taskB.acceptanceCriteria).toEqual(['criterion']);
            expect(taskB.priority).toBe('high');
            expect(taskB.type).toBe('feature');
            expect(taskB.links).toEqual(['https://example.com']);
            expect(taskB.steps).toEqual(['step']);
            expect(taskB.constraints).toEqual(['constraint']);
            expect(taskB.outOfScope).toEqual(['out']);
            expect(taskB.verification).toEqual(['verify']);
            expect(taskB.context).toEqual(['context']);
            expect(taskB.edgeCases).toEqual(['edge']);
            expect(taskB.dependencyIds).toEqual([idA]);
            const taskA = raw.tasks.find((t) => t.id === idA)!;
            expect(taskA.status).toBe('done');
            expect(taskA.history).toContain('data');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('save and load persist structured tasks', async () => {
        const tmpDir = createTempDir();
        try {
            const id = await pool.createTask({
                title: 'Persistent Task',
                description: 'desc',
                acceptanceCriteria: ['c1', 'c2'],
                priority: 'medium',
                type: 'bug',
                links: ['https://example.com'],
                steps: ['s1'],
                constraints: ['c'],
                outOfScope: ['o'],
                verification: ['v'],
                context: ['ctx'],
                edgeCases: ['e']
            });
            await pool.updateTask(id, { status: 'done', history: 'Saved data' });
            const filePath = path.join(tmpDir, 'tasks.json');
            await pool.save(filePath);

            const pool2 = new TaskPool();
            await pool2.loadFromFile(filePath);
            const tasks = pool2.getTasks();
            expect(tasks).toHaveLength(1);
            const task = tasks[0]!;
            expect(task.title).toBe('Persistent Task');
            expect(task.description).toBe('desc');
            expect(task.acceptanceCriteria).toEqual(['c1', 'c2']);
            expect(task.priority).toBe('medium');
            expect(task.type).toBe('bug');
            expect(task.links).toEqual(['https://example.com']);
            expect(task.steps).toEqual(['s1']);
            expect(task.constraints).toEqual(['c']);
            expect(task.outOfScope).toEqual(['o']);
            expect(task.verification).toEqual(['v']);
            expect(task.context).toEqual(['ctx']);
            expect(task.edgeCases).toEqual(['e']);
            expect(task.status).toBe('done');
            expect(task.history).toContain('Saved data');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load replaces existing tasks', async () => {
        const tmpDir = createTempDir();
        try {
            await pool.createTask({ title: 'Old Task' });
            const filePath = createTempFile(tmpDir, 'tasks.json', JSON.stringify({ tasks: [] }));
            await pool.loadFromFile(filePath);
            expect(pool.getTasks()).toHaveLength(0);
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load re-establishes dependency references', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const idB = await pool.createTask({ title: 'Task B' });
            await pool.updateTask(idB, { addDependency: idA });
            const filePath = path.join(tmpDir, 'tasks.json');
            await pool.save(filePath);

            const pool2 = new TaskPool();
            await pool2.loadFromFile(filePath);
            const tasks = pool2.getTasks();
            expect(tasks).toHaveLength(2);
            const taskB = tasks.find((t) => t.id === idB)!;
            expect(taskB.dependencies).toHaveLength(1);
            expect(taskB.dependencies[0]).toBe(idA);
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects a missing task title', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            description: 'no title here',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow('Invalid task title');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects an empty or over-long task title', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const emptyTitle = createTempFile(
                tmpDir,
                'empty-title.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: '   ',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(emptyTitle)).rejects.toThrow('Title must not be empty');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects a task description over the max length', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            description: 'z'.repeat(501),
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow(
                'Description must be at most 500 characters'
            );
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects a non-string task description', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            description: 42,
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow(
                'Description must be a string'
            );
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects invalid enums, links, and plan fields', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const base = {
                id: idA,
                title: 'Task A',
                history: '',
                status: 'ready',
                dependencyIds: []
            };
            const badPriority = createTempFile(
                tmpDir,
                'bad-priority.json',
                JSON.stringify({ tasks: [{ ...base, priority: 'urgent' }] })
            );
            const badType = createTempFile(
                tmpDir,
                'bad-type.json',
                JSON.stringify({ tasks: [{ ...base, type: 'epic' }] })
            );
            const badLink = createTempFile(
                tmpDir,
                'bad-link.json',
                JSON.stringify({ tasks: [{ ...base, links: ['nope'] }] })
            );
            const badStep = createTempFile(
                tmpDir,
                'bad-step.json',
                JSON.stringify({ tasks: [{ ...base, steps: ['x'.repeat(301)] }] })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(badPriority)).rejects.toThrow('Invalid priority');
            await expect(pool2.loadFromFile(badType)).rejects.toThrow('Invalid type');
            await expect(pool2.loadFromFile(badLink)).rejects.toThrow('Links items must be valid URLs');
            await expect(pool2.loadFromFile(badStep)).rejects.toThrow(
                'Steps items must be at most 300 characters'
            );
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects a non-string task history', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            history: 42,
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow(
                'Invalid task history in file'
            );
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load silently skips missing dependency references', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            history: '',
                            status: 'ready',
                            dependencyIds: ['nonexistent-dep']
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await pool2.loadFromFile(filePath);
            const tasks = pool2.getTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0]!.dependencies).toHaveLength(0);
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects an invalid task status', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            history: '',
                            status: 'finished',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow('Invalid task status');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects a missing task status', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Task A' });
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: idA,
                            title: 'Task A',
                            history: '',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(filePath)).rejects.toThrow('Invalid task status');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('static load creates a pool from a file path', async () => {
        const tmpDir = createTempDir();
        try {
            const id = await pool.createTask({ title: 'Static Load' });
            await pool.updateTask(id, { status: 'in_progress' });
            const filePath = path.join(tmpDir, 'tasks.json');
            await pool.save(filePath);

            const pool2 = await TaskPool.load(filePath);
            const tasks = pool2.getTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0]!.title).toBe('Static Load');
            expect(tasks[0]!.status).toBe('in_progress');
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('tasks reference dependencies by id and serialize without cycles', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        await pool.updateTask(idB, { addDependency: idA });
        const tasks = pool.getTasks();
        const taskB = tasks.find((t) => t.id === idB)!;
        expect(taskB.dependencies[0]).toBe(idA);
        expect(JSON.stringify(tasks)).toContain(idA);
        expect(JSON.stringify(tasks)).toContain(idB);
    });

    it('tolerates unknown dependency ids injected by direct mutation', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        await pool.updateTask(idB, { addDependency: idA });
        pool.getTasks().find((t) => t.id === idB)!.dependencies.push('unknown-dep' as UUID);
        await pool.updateTask(idC, { addDependency: idB });
        expect(pool.getTasks().find((t) => t.id === idC)!.dependencies).toEqual([idB]);
        await pool.updateTask(idA, { status: 'done' });
        expect(pool.getAvailableTasks().map((t) => t.id)).toContain(idB);
    });

    it('cycle detection revisits already visited nodes', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        const idE = await pool.createTask({ title: 'Task E' });
        const idF = await pool.createTask({ title: 'Task F' });
        await pool.updateTask(idE, { addDependency: idB });
        await pool.updateTask(idE, { addDependency: idC });
        await pool.updateTask(idB, { addDependency: idA });
        await pool.updateTask(idC, { addDependency: idA });
        await pool.updateTask(idF, { addDependency: idE });
        const taskF = pool.getTasks().find((t) => t.id === idF)!;
        expect(taskF.dependencies).toHaveLength(1);
        expect(taskF.dependencies[0]).toBe(idE);
    });

    it('cycle detection handles diamond dependencies', async () => {
        const idA = await pool.createTask({ title: 'Task A' });
        const idB = await pool.createTask({ title: 'Task B' });
        const idC = await pool.createTask({ title: 'Task C' });
        const idD = await pool.createTask({ title: 'Task D' });
        await pool.updateTask(idB, { addDependency: idA });
        await pool.updateTask(idC, { addDependency: idA });
        await pool.updateTask(idD, { addDependency: idB });
        await pool.updateTask(idD, { addDependency: idC });
        const tasks = pool.getTasks();
        const taskD = tasks.find((t) => t.id === idD)!;
        expect(taskD.dependencies).toHaveLength(2);
    });

    it('enforces custom limits from a TaskConfiguration', async () => {
        const custom = new TaskPool(
            new TaskConfiguration({
                maxTitleLength: 10,
                maxDescriptionLength: 50,
                maxAcceptanceCriteriaCount: 2,
                maxAcceptanceCriteriaLength: 5,
                maxLinksPerTask: 1,
                maxPlanFieldCount: 2,
                maxPlanFieldLength: 5,
                maxHistoryLength: 50,
                historyPreviewLength: 5
            })
        );
        await expect(custom.createTask({ title: 'y'.repeat(11) })).rejects.toThrow(
            'Title must be at most 10 characters'
        );
        await expect(
            custom.createTask({ title: 'ok', description: 'y'.repeat(51) })
        ).rejects.toThrow('Description must be at most 50 characters');
        await expect(
            custom.createTask({ title: 'ok', acceptanceCriteria: ['a', 'b', 'c'] })
        ).rejects.toThrow('Acceptance criteria must have at most 2 items');
        await expect(
            custom.createTask({ title: 'ok', links: ['https://a.example', 'https://b.example'] })
        ).rejects.toThrow('Links must have at most 1 items');
        await expect(custom.createTask({ title: 'ok', steps: ['a', 'b', 'c'] })).rejects.toThrow(
            'Steps must have at most 2 items'
        );
        const id = await custom.createTask({ title: 'short' });
        await expect(custom.updateTask(id, { title: 'y'.repeat(11) })).rejects.toThrow(
            'Title must be at most 10 characters'
        );
        await custom.updateTask(id, { history: 'z'.repeat(20) });
        await expect(custom.updateTask(id, { history: 'z'.repeat(5) })).rejects.toThrow(
            'task log would exceed 50 characters'
        );
        expect(custom.config.maxTitleLength).toBe(10);
        expect(custom.config.maxDescriptionLength).toBe(50);
        expect(custom.config.maxHistoryLength).toBe(50);
        expect(custom.config.historyPreviewLength).toBe(5);
    });
});
