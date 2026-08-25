import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TaskPool } from '../../src/index.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

describe('TaskPool persistence', () => {
    let pool: TaskPool;

    beforeEach(() => {
        pool = new TaskPool();
    });

    it('save writes tasks with all fields to a file', async () => {
        const tmpDir = createTempDir();
        try {
            const idA = await pool.createTask({ title: 'Save me A' });
            const idB = await pool.createTask({
                title: 'Save me B',
                description: 'a description',
                milestone: 'spiel-sdk-migration',
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
            expect(taskB.milestone).toBe('spiel-sdk-migration');
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
                milestone: 'release-1',
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
            expect(task.milestone).toBe('release-1');
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

    it('load keeps stored tasks without a priority; the default is create-time only', async () => {
        const tmpDir = createTempDir();
        try {
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: '123e4567-e89b-12d3-a456-426614174000',
                            title: 'Legacy Task',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await pool2.loadFromFile(filePath);
            expect(pool2.getTasks()[0]!.priority).toBeUndefined();

            await pool2.updateTask('123e4567-e89b-12d3-a456-426614174000', { history: 'note' });
            expect(pool2.getTasks()[0]!.priority).toBeUndefined();

            const freshId = await pool2.createTask({ title: 'Fresh Task' });
            expect(pool2.getTask(freshId)!.priority).toBe('low');
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

    it('load normalizes an empty milestone to no milestone', async () => {
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
                            milestone: '   ',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );

            const pool2 = new TaskPool();
            await pool2.loadFromFile(filePath);
            const loaded = pool2.getTask(idA)!;
            expect(loaded.milestone).toBeUndefined();
            expect('milestone' in loaded).toBe(false);
        } finally {
            removeTempDir(tmpDir);
        }
    });

    it('load rejects an invalid task milestone', async () => {
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
            const overLength = createTempFile(
                tmpDir,
                'over-length.json',
                JSON.stringify({ tasks: [{ ...base, milestone: 'm'.repeat(65) }] })
            );
            const spaced = createTempFile(
                tmpDir,
                'spaced-milestone.json',
                JSON.stringify({ tasks: [{ ...base, milestone: 'bad label' }] })
            );
            const nonAscii = createTempFile(
                tmpDir,
                'non-ascii.json',
                JSON.stringify({ tasks: [{ ...base, milestone: 'café' }] })
            );
            const nonString = createTempFile(
                tmpDir,
                'non-string.json',
                JSON.stringify({ tasks: [{ ...base, milestone: 42 }] })
            );

            const pool2 = new TaskPool();
            await expect(pool2.loadFromFile(overLength)).rejects.toThrow(
                'Milestone must be at most 64 characters (got 65)'
            );
            await expect(pool2.loadFromFile(spaced)).rejects.toThrow(
                'Milestone must not contain whitespace'
            );
            await expect(pool2.loadFromFile(nonAscii)).rejects.toThrow(
                'Milestone must contain only ASCII characters'
            );
            await expect(pool2.loadFromFile(nonString)).rejects.toThrow(
                'Milestone must be a string'
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
});
