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
    return mkdtemp(join(tmpdir(), 'task-pool-store-'));
}

describe('TaskPool store backend', () => {
    it('defaults to an in-memory store so a pool always persists', async () => {
        const pool = await TaskPool.create();
        const id = await pool.createTask({ title: 'Default store' });
        // createTask/updateTask/clear all succeed against the in-memory store.
        await pool.updateTask(id, { status: 'in_progress', history: 'note' });
        await pool.clear();
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask auto-persists the new task to a JsonFileStore', async () => {
        const dir = await tempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const id = await pool.createTask({ title: 'Store Task', priority: 'high' });
            const store = new JsonFileStore<Task>({ dir });
            expect(await store.has(id)).toBe(true);
            const stored = await store.get(id);
            expect(stored).toBeDefined();
            expect(stored!.title).toBe('Store Task');
            expect(stored!.status).toBe('ready');
            expect(stored!.priority).toBe('high');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('updateTask auto-persists the changed task', async () => {
        const dir = await tempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            const id = await pool.createTask({ title: 'Before' });
            await pool.updateTask(id, { title: 'After', status: 'in_progress', history: 'note' });
            const store = new JsonFileStore<Task>({ dir });
            const stored = await store.get(id);
            expect(stored!.title).toBe('After');
            expect(stored!.status).toBe('in_progress');
            expect(stored!.history).toContain('note');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('clear empties both the pool and the store', async () => {
        const dir = await tempDir();
        try {
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            await pool.createTask({ title: 'A' });
            await pool.createTask({ title: 'B' });
            await pool.clear();
            expect(pool.getTasks()).toHaveLength(0);
            const store = new JsonFileStore<Task>({ dir });
            expect(await store.entries()).toHaveLength(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create loads stored tasks and re-establishes dependencies', async () => {
        const dir = await tempDir();
        try {
            const store = new JsonFileStore<Task>({ dir });
            const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
            const idB = 'aaaaaaaa-2222-4222-8222-222222222222';
            await store.set(makeTask({ id: idA, title: 'A' }));
            await store.set(
                makeTask({ id: idB, title: 'B', status: 'pending', dependencies: [idA] })
            );

            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            expect(pool.getTasks()).toHaveLength(2);
            const taskB = pool.getTask(idB)!;
            expect(taskB.status).toBe('pending');
            expect(taskB.dependencies).toEqual([idA]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create prunes dangling dependency ids', async () => {
        const dir = await tempDir();
        try {
            const store = new JsonFileStore<Task>({ dir });
            const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
            await store.set(
                makeTask({
                    id: idA,
                    title: 'A',
                    dependencies: ['bbbbbbbb-0000-0000-0000-000000000000']
                })
            );
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            expect(pool.getTask(idA)!.dependencies).toEqual([]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('create validates stored tasks strictly', async () => {
        const badStatusDir = await tempDir();
        try {
            const badStatus = new JsonFileStore<Task>({ dir: badStatusDir });
            await badStatus.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'X',
                status: 'finished',
                history: '',
                dependencies: []
            } as unknown as Task);
            await expect(
                TaskPool.create(new TaskConfiguration({ dir: badStatusDir }))
            ).rejects.toThrow('Invalid task status in store');
        } finally {
            await rm(badStatusDir, { recursive: true, force: true });
        }

        const badTitleDir = await tempDir();
        try {
            const badTitle = new JsonFileStore<Task>({ dir: badTitleDir });
            await badTitle.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                history: '',
                status: 'ready',
                dependencies: []
            } as unknown as Task);
            await expect(
                TaskPool.create(new TaskConfiguration({ dir: badTitleDir }))
            ).rejects.toThrow('Invalid task title in store');
        } finally {
            await rm(badTitleDir, { recursive: true, force: true });
        }

        const badHistoryDir = await tempDir();
        try {
            const badHistory = new JsonFileStore<Task>({ dir: badHistoryDir });
            await badHistory.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'X',
                status: 'ready',
                history: 42,
                dependencies: []
            } as unknown as Task);
            await expect(
                TaskPool.create(new TaskConfiguration({ dir: badHistoryDir }))
            ).rejects.toThrow('Invalid task history in store');
        } finally {
            await rm(badHistoryDir, { recursive: true, force: true });
        }
    });

    it('create validates structured fields', async () => {
        const dir = await tempDir();
        try {
            const store = new JsonFileStore<Task>({ dir });
            await store.set(
                makeTask({
                    id: 'aaaaaaaa-1111-4111-8111-111111111111',
                    title: 'X',
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

    it('create persists writes back into the JsonFileStore', async () => {
        const dir = await tempDir();
        try {
            const store = new JsonFileStore<Task>({ dir });
            const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
            await store.set(makeTask({ id: idA, title: 'A' }));
            const pool = await TaskPool.create(new TaskConfiguration({ dir }));
            expect(pool.getTask(idA)!.title).toBe('A');
            // persisting back to the JsonFileStore after loading works
            const idNew = await pool.createTask({ title: 'New' });
            expect(await store.has(idNew)).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});