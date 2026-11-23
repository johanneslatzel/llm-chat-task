import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStore, MemoryStore } from '@johannes.latzel/json-file-store';
import { TaskConfiguration, TaskPool } from '../../src/index.js';
import type { Task } from '../../src/types.js';

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
    return { history: '', status: 'ready', dependencies: [], ...partial };
}

async function tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'task-pool-injection-'));
}

describe('TaskPool store injection', () => {
    it('loads and writes through an injected store', async () => {
        const store = new MemoryStore<Task>();
        const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
        const idB = 'aaaaaaaa-2222-4222-8222-222222222222';
        await store.set(makeTask({ id: idA, title: 'Stored A' }));
        await store.set(
            makeTask({ id: idB, title: 'Stored B', status: 'pending', dependencies: [idA] }),
        );

        const pool = await TaskPool.create({ store });
        expect(pool.getTask(idA)!.title).toBe('Stored A');
        expect(pool.getTask(idB)!.dependencies).toEqual([idA]);

        const idC = await pool.createTask({ title: 'Created' });
        expect(await store.has(idC)).toBe(true);
        await pool.updateTask(idC, { title: 'Updated', history: 'note' });
        expect((await store.get(idC))!.title).toBe('Updated');

        await pool.clear();
        expect(await store.entries()).toHaveLength(0);
    });

    it('falls back to a JsonFileStore from configuration.dir', async () => {
        const dir = await tempDir();
        try {
            const pool = await TaskPool.create({
                configuration: new TaskConfiguration({ dir }),
            });
            const id = await pool.createTask({ title: 'JSON task' });
            const store = new JsonFileStore<Task>({ dir });
            expect(await store.has(id)).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('defaults to an in-memory store for empty options', async () => {
        const previous = process.env.LLM_CHAT_TASK_DIR;
        delete process.env.LLM_CHAT_TASK_DIR;
        try {
            const pool = await TaskPool.create({});
            const id = await pool.createTask({ title: 'Memory task' });
            expect(pool.getTask(id)!.title).toBe('Memory task');
            await pool.clear();
            expect(pool.getTasks()).toHaveLength(0);
        } finally {
            if (previous !== undefined) {
                process.env.LLM_CHAT_TASK_DIR = previous;
            }
        }
    });

    it('prefers an injected store over configuration.dir', async () => {
        const dir = await tempDir();
        try {
            const fileStore = new JsonFileStore<Task>({ dir });
            const fileId = 'aaaaaaaa-3333-4333-8333-333333333333';
            await fileStore.set(makeTask({ id: fileId, title: 'File task' }));
            const store = new MemoryStore<Task>();
            const memoryId = 'aaaaaaaa-4444-4444-8444-444444444444';
            await store.set(makeTask({ id: memoryId, title: 'Memory task' }));

            const pool = await TaskPool.create({
                configuration: new TaskConfiguration({ dir }),
                store,
            });
            expect(pool.getTask(memoryId)!.title).toBe('Memory task');
            expect(pool.getTask(fileId)).toBeUndefined();

            const created = await pool.createTask({ title: 'Created' });
            expect(await store.has(created)).toBe(true);
            expect(await fileStore.has(created)).toBe(false);

            await pool.clear();
            expect(await store.entries()).toHaveLength(0);
            expect(await fileStore.has(fileId)).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('validates tasks loaded from an injected store', async () => {
        const store = new MemoryStore<Task>();
        await store.set({
            id: 'aaaaaaaa-5555-4555-8555-555555555555',
            title: 'Bad status',
            history: '',
            status: 'finished',
            dependencies: [],
        } as unknown as Task);
        await expect(TaskPool.create({ store })).rejects.toThrow('Invalid task status in store');
    });
});
