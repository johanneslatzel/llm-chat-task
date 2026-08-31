import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStore } from '@johannes.latzel/json-file-store';
import { TaskConfiguration } from '../../src/lib/config.js';
import { TaskPool, MIN_ID_PREFIX_LENGTH } from '../../src/index.js';
import type { Task } from '../../src/types.js';

describe('TaskPool.resolveId', () => {
    let pool: TaskPool;

    beforeEach(async () => {
        pool = await TaskPool.create();
    });

    it('returns an exact match for a full id', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const resolution = pool.resolveId(id);
        expect(resolution.kind).toBe('exact');
        if (resolution.kind === 'exact') {
            expect(resolution.task.id).toBe(id);
        }
    });

    it('resolves a unique eight-character prefix', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const prefix = id.slice(0, MIN_ID_PREFIX_LENGTH);
        const resolution = pool.resolveId(prefix);
        expect(resolution.kind).toBe('prefix');
        if (resolution.kind === 'prefix') {
            expect(resolution.task.id).toBe(id);
        }
    });

    it('matches prefixes case-insensitively and ignores surrounding whitespace', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        const prefix = id.slice(0, MIN_ID_PREFIX_LENGTH).toUpperCase();
        const resolution = pool.resolveId('  ' + prefix + '  ');
        expect(resolution.kind).toBe('prefix');
        if (resolution.kind === 'prefix') {
            expect(resolution.task.id).toBe(id);
        }
    });

    it('reports too-short for input below the minimum that is not an exact hit', async () => {
        await pool.createTask({ title: 'Task A' });
        expect(pool.resolveId('').kind).toBe('too-short');
        expect(pool.resolveId('   ').kind).toBe('too-short');
        expect(pool.resolveId('abc').kind).toBe('too-short');
        expect(pool.resolveId('a'.repeat(MIN_ID_PREFIX_LENGTH - 1)).kind).toBe('too-short');
    });

    it('reports not-found for a long enough unknown prefix', async () => {
        await pool.createTask({ title: 'Task A' });
        expect(pool.resolveId('ffffffff').kind).toBe('not-found');
        expect(pool.resolveId('f'.repeat(36)).kind).toBe('not-found');
    });

    it('prefers an exact hit over prefix candidates', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'task-pool-resolve-'));
        try {
            const store = new JsonFileStore<Task>({ dir });
            // The short id is not a UUID; cast it because only loading (which
            // reads ids as plain strings) and `resolveId` observe it.
            await store.set({
                id: 'aaaaaaaa',
                title: 'Short id task',
                history: '',
                status: 'ready',
                dependencies: []
            } as unknown as Task);
            await store.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'Long id task',
                history: '',
                status: 'ready',
                dependencies: []
            });
            const loaded = await TaskPool.create(new TaskConfiguration({ dir }));
            const exact = loaded.resolveId('aaaaaaaa');
            expect(exact.kind).toBe('exact');
            if (exact.kind === 'exact') {
                expect(exact.task.title).toBe('Short id task');
            }
            const prefix = loaded.resolveId('aaaaaaaa-1111');
            expect(prefix.kind).toBe('prefix');
            if (prefix.kind === 'prefix') {
                expect(prefix.task.title).toBe('Long id task');
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('reports ambiguous with all candidate ids for a shared prefix', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'task-pool-resolve-'));
        try {
            const store = new JsonFileStore<Task>({ dir });
            await store.set({
                id: 'aaaaaaaa-1111-4111-8111-111111111111',
                title: 'Task A',
                history: '',
                status: 'ready',
                dependencies: []
            });
            await store.set({
                id: 'aaaaaaaa-2222-4222-8222-222222222222',
                title: 'Task B',
                history: '',
                status: 'ready',
                dependencies: []
            });
            const loaded = await TaskPool.create(new TaskConfiguration({ dir }));
            const resolution = loaded.resolveId('aaaaaaaa');
            expect(resolution.kind).toBe('ambiguous');
            if (resolution.kind === 'ambiguous') {
                expect(resolution.candidates).toEqual([
                    'aaaaaaaa-1111-4111-8111-111111111111',
                    'aaaaaaaa-2222-4222-8222-222222222222'
                ]);
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});