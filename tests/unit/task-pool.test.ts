import { describe, it, expect, beforeEach } from 'vitest';
import type { UUID } from 'crypto';
import { TaskPool, TaskConfiguration } from '../../src/index.js';

describe('TaskPool', () => {
    let pool: TaskPool;

    beforeEach(async () => {
        pool = await TaskPool.create();
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
            'Title must be at most 100 characters',
        );
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask stores a description', async () => {
        const id = await pool.createTask({ title: 'Task A', description: '  Why this matters  ' });
        expect(pool.getTask(id)!.description).toBe('Why this matters');
    });

    it('createTask rejects an empty description', async () => {
        await expect(pool.createTask({ title: 'Task A', description: '   ' })).rejects.toThrow(
            'Description must not be empty',
        );
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask rejects a description over the max length', async () => {
        await expect(
            pool.createTask({ title: 'Task A', description: 'y'.repeat(501) }),
        ).rejects.toThrow('Description must be at most 500 characters');
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask stores and trims a milestone', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            milestone: '  spiel-sdk-migration  ',
        });
        expect(pool.getTask(id)!.milestone).toBe('spiel-sdk-migration');
    });

    it('createTask ignores an empty or whitespace-only milestone', async () => {
        const idEmpty = await pool.createTask({ title: 'Task A', milestone: '' });
        const idBlank = await pool.createTask({ title: 'Task B', milestone: '   ' });
        expect(pool.getTask(idEmpty)!.milestone).toBeUndefined();
        expect(pool.getTask(idBlank)!.milestone).toBeUndefined();
        expect('milestone' in pool.getTask(idEmpty)!).toBe(false);
    });

    it('createTask accepts a milestone at exactly the max length', async () => {
        const id = await pool.createTask({ title: 'Task A', milestone: 'm'.repeat(64) });
        expect(pool.getTask(id)!.milestone).toHaveLength(64);
    });

    it('createTask rejects a milestone over the max length', async () => {
        await expect(
            pool.createTask({ title: 'Task A', milestone: 'm'.repeat(65) }),
        ).rejects.toThrow('Milestone must be at most 64 characters (got 65)');
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask rejects a non-string milestone', async () => {
        await expect(pool.createTask({ title: 'Task A', milestone: 42 } as never)).rejects.toThrow(
            'Milestone must be a string',
        );
    });

    it('createTask rejects milestones containing internal whitespace', async () => {
        await expect(pool.createTask({ title: 'Task A', milestone: 'has space' })).rejects.toThrow(
            'Milestone must not contain whitespace',
        );
        await expect(
            pool.createTask({ title: 'Task A', milestone: 'tab\tinside' }),
        ).rejects.toThrow('Milestone must not contain whitespace');
        await expect(
            pool.createTask({ title: 'Task A', milestone: 'line\nbreak' }),
        ).rejects.toThrow('Milestone must not contain whitespace');
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask rejects milestones with non-ASCII characters', async () => {
        await expect(pool.createTask({ title: 'Task A', milestone: 'café' })).rejects.toThrow(
            'Milestone must contain only ASCII characters',
        );
        await expect(pool.createTask({ title: 'Task A', milestone: '🚀-launch' })).rejects.toThrow(
            'Milestone must contain only ASCII characters',
        );
        expect(pool.getTasks()).toHaveLength(0);
    });

    it('createTask stores and trims acceptance criteria', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            acceptanceCriteria: ['  criterion one  ', 'criterion two'],
        });
        expect(pool.getTask(id)!.acceptanceCriteria).toEqual(['criterion one', 'criterion two']);
    });

    it('createTask rejects too many acceptance criteria', async () => {
        await expect(
            pool.createTask({
                title: 'Task A',
                acceptanceCriteria: Array.from({ length: 11 }, () => 'c'),
            }),
        ).rejects.toThrow('Acceptance criteria must have at most 10 items');
    });

    it('createTask rejects an acceptance criterion over the item length', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: ['c'.repeat(201)] }),
        ).rejects.toThrow('Acceptance criteria items must be at most 200 characters');
    });

    it('createTask rejects an empty acceptance criterion', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: ['   '] }),
        ).rejects.toThrow('Acceptance criteria items must not be empty');
    });

    it('createTask rejects non-array and non-string acceptance criteria', async () => {
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: 'not-an-array' } as never),
        ).rejects.toThrow('Acceptance criteria must be an array of strings');
        await expect(
            pool.createTask({ title: 'Task A', acceptanceCriteria: [42] } as never),
        ).rejects.toThrow('Acceptance criteria items must be strings');
    });

    it('createTask stores priority and type', async () => {
        const id = await pool.createTask({ title: 'Task A', priority: 'high', type: 'bug' });
        const task = pool.getTask(id)!;
        expect(task.priority).toBe('high');
        expect(task.type).toBe('bug');
    });

    it('createTask defaults an omitted priority to low', async () => {
        const id = await pool.createTask({ title: 'Task A' });
        expect(pool.getTask(id)!.priority).toBe('low');
    });

    it('createTask keeps explicit low, medium, and high priorities', async () => {
        for (const priority of ['low', 'medium', 'high'] as const) {
            const id = await pool.createTask({ title: 'Task A', priority });
            expect(pool.getTask(id)!.priority).toBe(priority);
        }
    });

    it('createTask rejects an invalid priority', async () => {
        await expect(
            pool.createTask({ title: 'Task A', priority: 'urgent' } as never),
        ).rejects.toThrow("Invalid priority 'urgent'. Allowed values: low, medium, high");
    });

    it('createTask rejects an invalid type', async () => {
        await expect(pool.createTask({ title: 'Task A', type: 'epic' } as never)).rejects.toThrow(
            "Invalid type 'epic'. Allowed values: feature, bug, refactor, chore, research",
        );
    });

    it('createTask stores and trims links', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            links: ['  https://example.com/a  ', 'https://example.com/b'],
        });
        expect(pool.getTask(id)!.links).toEqual(['https://example.com/a', 'https://example.com/b']);
    });

    it('createTask rejects an invalid link URL', async () => {
        await expect(pool.createTask({ title: 'Task A', links: ['not-a-url'] })).rejects.toThrow(
            'Links items must be valid URLs',
        );
    });

    it('createTask rejects too many links', async () => {
        const links = Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`);
        await expect(pool.createTask({ title: 'Task A', links })).rejects.toThrow(
            'Links must have at most 20 items',
        );
    });

    it('createTask rejects non-string and empty links', async () => {
        await expect(pool.createTask({ title: 'Task A', links: [42] } as never)).rejects.toThrow(
            'Links items must be strings',
        );
        await expect(pool.createTask({ title: 'Task A', links: ['  '] })).rejects.toThrow(
            'Links items must not be empty',
        );
        await expect(pool.createTask({ title: 'Task A', links: 'nope' } as never)).rejects.toThrow(
            'Links must be an array of strings',
        );
    });

    it('createTask stores the plan arrays', async () => {
        const id = await pool.createTask({
            title: 'Task A',
            steps: ['step one', 'step two'],
            constraints: ['no new deps', 'match the pattern'],
            outOfScope: ['no frontend'],
            verification: ['npm run verify'],
            context: ['src/foo.ts is the entry point'],
            edgeCases: ['empty input is valid'],
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
            'Steps must have at most 20 items',
        );
        await expect(
            pool.createTask({ title: 'Task A', constraints: ['c'.repeat(301)] }),
        ).rejects.toThrow('Constraints items must be at most 300 characters');
        await expect(pool.createTask({ title: 'Task A', outOfScope: [' '] })).rejects.toThrow(
            'Out of scope items must not be empty',
        );
        await expect(
            pool.createTask({ title: 'Task A', verification: 'nope' } as never),
        ).rejects.toThrow('Verification must be an array of strings');
        await expect(pool.createTask({ title: 'Task A', context: [7] } as never)).rejects.toThrow(
            'Context items must be strings',
        );
    });

    it('clear removes all tasks', async () => {
        await pool.createTask({ title: 'Task A' });
        await pool.createTask({ title: 'Task B' });
        await pool.clear();
        expect(pool.getTasks()).toHaveLength(0);
        expect(pool.getAvailableTasks()).toHaveLength(0);
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
        pool.getTasks()
            .find((t) => t.id === idB)!
            .dependencies.push('unknown-dep' as UUID);
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
        const custom = await TaskPool.create(
            new TaskConfiguration({
                maxTitleLength: 10,
                maxDescriptionLength: 50,
                maxMilestoneLength: 10,
                maxAcceptanceCriteriaCount: 2,
                maxAcceptanceCriteriaLength: 5,
                maxLinksPerTask: 1,
                maxPlanFieldCount: 2,
                maxPlanFieldLength: 5,
                maxHistoryLength: 50,
                historyPreviewLength: 5,
            }),
        );
        await expect(custom.createTask({ title: 'y'.repeat(11) })).rejects.toThrow(
            'Title must be at most 10 characters',
        );
        await expect(
            custom.createTask({ title: 'ok', description: 'y'.repeat(51) }),
        ).rejects.toThrow('Description must be at most 50 characters');
        await expect(custom.createTask({ title: 'ok', milestone: 'm'.repeat(11) })).rejects.toThrow(
            'Milestone must be at most 10 characters',
        );
        await expect(
            custom.createTask({ title: 'ok', acceptanceCriteria: ['a', 'b', 'c'] }),
        ).rejects.toThrow('Acceptance criteria must have at most 2 items');
        await expect(
            custom.createTask({ title: 'ok', links: ['https://a.example', 'https://b.example'] }),
        ).rejects.toThrow('Links must have at most 1 items');
        await expect(custom.createTask({ title: 'ok', steps: ['a', 'b', 'c'] })).rejects.toThrow(
            'Steps must have at most 2 items',
        );
        const id = await custom.createTask({ title: 'short' });
        await expect(custom.updateTask(id, { title: 'y'.repeat(11) })).rejects.toThrow(
            'Title must be at most 10 characters',
        );
        await custom.updateTask(id, { history: 'z'.repeat(20) });
        await expect(custom.updateTask(id, { history: 'z'.repeat(5) })).rejects.toThrow(
            'task log would exceed 50 characters',
        );
        expect(custom.config.maxTitleLength).toBe(10);
        expect(custom.config.maxDescriptionLength).toBe(50);
        expect(custom.config.maxMilestoneLength).toBe(10);
        expect(custom.config.maxHistoryLength).toBe(50);
        expect(custom.config.historyPreviewLength).toBe(5);
    });
});
