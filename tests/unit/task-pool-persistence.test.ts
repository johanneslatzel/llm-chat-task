import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStore } from '@johannes.latzel/json-file-store';
import { TaskConfiguration } from '../../src/lib/config.js';
import { TaskPool } from '../../src/index.js';
import type { Task } from '../../src/types.js';

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
    return { history: '', status: 'ready', dependencies: [], ...partial };
}

async function tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'task-pool-persistence-'));
}

/** Creates a store on a fresh temp dir and returns it with its dir. */
async function storeOnTempDir(): Promise<{ dir: string; store: JsonFileStore<Task> }> {
    const dir = await tempDir();
    return { dir, store: new JsonFileStore<Task>({ dir }) };
}

describe('TaskPool persistence (store-based)', () => {
    it('persists created and updated tasks into a JsonFileStore', async () => {
        const { dir } = await storeOnTempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const idA = await pool.createTask({ title: 'Persist A', priority: 'high' });
            const idB = await pool.createTask({ title: 'Persist B' });
            await pool.updateTask(idB, { addDependency: idA, history: 'dep' });
            await pool.updateTask(idA, { status: 'done', history: 'data' });

            const reloaded = await TaskPool.create(new TaskConfiguration({ dir }));
            const tasks = reloaded.getTasks();
            expect(tasks).toHaveLength(2);
            const taskA = reloaded.getTask(idA)!;
            expect(taskA.title).toBe('Persist A');
            expect(taskA.priority).toBe('high');
            expect(taskA.status).toBe('done');
            expect(taskA.history).toContain('data');
            const taskB = reloaded.getTask(idB)!;
            expect(taskB.dependencies).toEqual([idA]);
            expect(taskB.history).toContain('dep');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create preserves all structured fields', async () => {
        const { dir } = await storeOnTempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
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

            const reloaded = await TaskPool.create(new TaskConfiguration({ dir }));
            const task = reloaded.getTask(id)!;
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
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create over a JsonFileStore creates a pool bound to that store', async () => {
        const { dir } = await storeOnTempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const id = await pool.createTask({ title: 'Bound task' });
            // a separate pool over the same dir sees it
            const reloaded = await TaskPool.create(new TaskConfiguration({ dir }));
            expect(reloaded.getTask(id)!.title).toBe('Bound task');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create keeps stored tasks without a priority; default is create-time only', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            const id = '123e4567-e89b-12d3-a456-426614174000';
            // simulate a legacy task persisted without a priority
            await store.set(makeTask({ id, title: 'Legacy Task' }));
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            expect(pool.getTask(id)!.priority).toBeUndefined();

            await pool.updateTask(id, { history: 'note' });
            expect(pool.getTask(id)!.priority).toBeUndefined();

            const freshId = await pool.createTask({ title: 'Fresh Task' });
            expect(pool.getTask(freshId)!.priority).toBe('low');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create re-establishes dependency references', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
            const idB = 'aaaaaaaa-2222-4222-8222-222222222222';
            await store.set(makeTask({ id: idA, title: 'Task A' }));
            await store.set(
                makeTask({ id: idB, title: 'Task B', status: 'pending', dependencies: [idA] })
            );

            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const tasks = pool.getTasks();
            expect(tasks).toHaveLength(2);
            const taskB = pool.getTask(idB)!;
            expect(taskB.dependencies).toHaveLength(1);
            expect(taskB.dependencies[0]).toBe(idA);
            expect(taskB.status).toBe('pending');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects a missing task title', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            await store.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                description: 'no title here',
                history: '',
                status: 'ready',
                dependencies: []
            } as unknown as Task);
            await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                'Invalid task title in store'
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects an empty or over-long task title', async () => {
        const dir = await tempDir();
        try {
            for (const title of ['   ', 'x'.repeat(101)]) {
                const bad = new JsonFileStore<Task>({ dir });
                await bad.set(makeTask({ id: 'aaaaaaaa-1111-4111-8111-111111111111', title }));
                await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow();
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects an invalid milestone', async () => {
        const dir = await tempDir();
        try {
            const cases: Array<[string, string]> = [
                ['bad label', 'Milestone must not contain whitespace'],
                ['m'.repeat(65), 'Milestone must be at most 64 characters'],
                ['café', 'Milestone must contain only ASCII characters']
            ];
            for (const [milestone, message] of cases) {
                const store = new JsonFileStore<Task>({ dir });
                await store.set(
                    makeTask({ id: 'aaaaaaaa-1111-4111-8111-111111111111', title: 'A', milestone })
                );
                await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                    message
                );
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects invalid enums, links, and plan fields', async () => {
        const dir = await tempDir();
        try {
            const invalid: Array<[Task, string]> = [
                [
                    {
                        id: 'aaaaaaaa-1111-4111-8111-111111111111',
                        title: 'A',
                        history: '',
                        status: 'ready',
                        dependencies: [],
                        priority: 'urgent'
                    } as unknown as Task,
                    'Invalid priority'
                ],
                [
                    {
                        id: 'aaaaaaaa-1111-4111-8111-111111111111',
                        title: 'A',
                        history: '',
                        status: 'ready',
                        dependencies: [],
                        type: 'epic'
                    } as unknown as Task,
                    'Invalid type'
                ],
                [
                    {
                        id: 'aaaaaaaa-1111-4111-8111-111111111111',
                        title: 'A',
                        history: '',
                        status: 'ready',
                        dependencies: [],
                        links: ['nope']
                    } as Task,
                    'Links items must be valid URLs'
                ],
                [
                    {
                        id: 'aaaaaaaa-1111-4111-8111-111111111111',
                        title: 'A',
                        history: '',
                        status: 'ready',
                        dependencies: [],
                        steps: ['x'.repeat(301)]
                    } as Task,
                    'Steps items must be at most 300 characters'
                ]
            ];
            for (const [task, message] of invalid) {
                const store = new JsonFileStore<Task>({ dir });
                await store.set(task);
                await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                    message
                );
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects a non-string or over-long description', async () => {
        const dir = await tempDir();
        try {
            const store = new JsonFileStore<Task>({ dir });
            await store.set(
                makeTask({
                    id: 'aaaaaaaa-1111-4111-8111-111111111111',
                    title: 'A',
                    description: 42 as unknown as string
                })
            );
            await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                'Description must be a string'
            );

            const store2 = new JsonFileStore<Task>({ dir });
            await store2.set(
                makeTask({
                    id: 'aaaaaaaa-1111-4111-8111-111111111111',
                    title: 'A',
                    description: 'z'.repeat(501)
                })
            );
            await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                'Description must be at most 500 characters'
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create normalizes an empty milestone to no milestone', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            const id = 'aaaaaaaa-1111-4111-8111-111111111111';
            await store.set(makeTask({ id, title: 'A', milestone: '   ' }));
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const loaded = pool.getTask(id)!;
            expect(loaded.milestone).toBeUndefined();
            expect('milestone' in loaded).toBe(false);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create rejects a non-string or invalid task history/status', async () => {
        const dir = await tempDir();
        try {
            const raw = new JsonFileStore<Task>({ dir });
            await raw.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'A',
                history: 42,
                status: 'ready',
                dependencies: []
            } as unknown as Task);
            await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                'Invalid task history in store'
            );

            const badStatus = new JsonFileStore<Task>({ dir });
            await badStatus.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'A',
                history: '',
                status: 'finished',
                dependencies: []
            } as unknown as Task);
            await expect(TaskPool.create(new TaskConfiguration({ dir }))).rejects.toThrow(
                'Invalid task status in store'
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create silently skips dangling dependency references', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
            await store.set(
                makeTask({
                    id: idA,
                    title: 'A',
                    dependencies: ['bbbbbbbb-0000-0000-0000-000000000000']
                })
            );
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const tasks = pool.getTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0]!.dependencies).toHaveLength(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('clear removes all values from a JsonFileStore', async () => {
        const { dir, store } = await storeOnTempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            await pool.createTask({ title: 'A' });
            await pool.createTask({ title: 'B' });
            await pool.clear();
            expect(pool.getTasks()).toHaveLength(0);
            expect(await store.entries()).toHaveLength(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});