import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPool, MIN_ID_PREFIX_LENGTH } from '../../src/index.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

describe('TaskPool.resolveId', () => {
    let pool: TaskPool;

    beforeEach(() => {
        pool = new TaskPool();
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
        const tmpDir = createTempDir();
        try {
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: 'aaaaaaaa',
                            title: 'Short id task',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        },
                        {
                            id: 'aaaaaaaa-1111-4111-8111-111111111111',
                            title: 'Long id task',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );
            const loaded = await TaskPool.load(filePath);
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
            removeTempDir(tmpDir);
        }
    });

    it('reports ambiguous with all candidate ids for a shared prefix', async () => {
        const tmpDir = createTempDir();
        try {
            const filePath = createTempFile(
                tmpDir,
                'tasks.json',
                JSON.stringify({
                    tasks: [
                        {
                            id: 'aaaaaaaa-1111-4111-8111-111111111111',
                            title: 'Task A',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        },
                        {
                            id: 'aaaaaaaa-2222-4222-8222-222222222222',
                            title: 'Task B',
                            history: '',
                            status: 'ready',
                            dependencyIds: []
                        }
                    ]
                })
            );
            const loaded = await TaskPool.load(filePath);
            const resolution = loaded.resolveId('aaaaaaaa');
            expect(resolution.kind).toBe('ambiguous');
            if (resolution.kind === 'ambiguous') {
                expect(resolution.candidates).toEqual([
                    'aaaaaaaa-1111-4111-8111-111111111111',
                    'aaaaaaaa-2222-4222-8222-222222222222'
                ]);
            }
        } finally {
            removeTempDir(tmpDir);
        }
    });
});
