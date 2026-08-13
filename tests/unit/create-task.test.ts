import { describe, it, expect, vi } from 'vitest';
import { TaskPool, CreateTaskTool } from '../../src/index.js';
import { ResultStatus } from '@johannes.latzel/llm-chat';

describe('CreateTaskTool', () => {
    it('creates a task and returns its id', async () => {
        const pool = new TaskPool();
        const tool = new CreateTaskTool(pool);
        const result = await tool.execute({ title: 'New task' });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        expect(result[0]!.result).toContain('Task created');
        expect(result[0]!.result).toContain('id:');
        expect(pool.getTasks()).toHaveLength(1);
        expect(pool.getTasks()[0]!.title).toBe('New task');
    });

    it('creates a fully structured task', async () => {
        const pool = new TaskPool();
        const tool = new CreateTaskTool(pool);
        const result = await tool.execute({
            title: 'Add validation',
            description: 'Why it matters',
            acceptance_criteria: ['criterion one', 'criterion two'],
            priority: 'high',
            type: 'feature',
            links: ['https://example.com'],
            steps: ['step one'],
            constraints: ['no new deps'],
            out_of_scope: ['no frontend'],
            verification: ['npm run verify'],
            context: ['src/foo.ts is the entry point'],
            edge_cases: ['empty input']
        });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = pool.getTasks()[0]!;
        expect(task.title).toBe('Add validation');
        expect(task.description).toBe('Why it matters');
        expect(task.acceptanceCriteria).toEqual(['criterion one', 'criterion two']);
        expect(task.priority).toBe('high');
        expect(task.type).toBe('feature');
        expect(task.links).toEqual(['https://example.com']);
        expect(task.steps).toEqual(['step one']);
        expect(task.constraints).toEqual(['no new deps']);
        expect(task.outOfScope).toEqual(['no frontend']);
        expect(task.verification).toEqual(['npm run verify']);
        expect(task.context).toEqual(['src/foo.ts is the entry point']);
        expect(task.edgeCases).toEqual(['empty input']);
    });

    it('ignores non-string optional scalars and non-array arrays', async () => {
        const pool = new TaskPool();
        const tool = new CreateTaskTool(pool);
        const result = await tool.execute({
            title: 'Task',
            description: 42,
            priority: 7,
            type: {},
            acceptance_criteria: 'nope',
            links: 12,
            steps: 'nope'
        });
        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = pool.getTasks()[0]!;
        expect(task.description).toBeUndefined();
        expect(task.priority).toBeUndefined();
        expect(task.type).toBeUndefined();
        expect(task.acceptanceCriteria).toBeUndefined();
        expect(task.links).toBeUndefined();
        expect(task.steps).toBeUndefined();
    });

    it('reports missing title', async () => {
        const tool = new CreateTaskTool(new TaskPool());
        const result = await tool.execute({});
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('title');
    });

    it('reports non-string title', async () => {
        const tool = new CreateTaskTool(new TaskPool());
        const result = await tool.execute({ title: 42 });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('title');
    });

    it('handles pool error in createTask', async () => {
        const pool = new TaskPool();
        vi.spyOn(pool, 'createTask').mockRejectedValueOnce(new Error('pool failure'));
        const tool = new CreateTaskTool(pool);
        const result = await tool.execute({ title: 'test' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toBe('pool failure');
    });

    it('reports an empty title', async () => {
        const tool = new CreateTaskTool(new TaskPool());
        const result = await tool.execute({ title: '   ' });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('Title must not be empty');
    });

    it('reports an over-long title', async () => {
        const tool = new CreateTaskTool(new TaskPool());
        const result = await tool.execute({ title: 'x'.repeat(101) });
        expect(result[0]!.status).toBe(ResultStatus.Error);
        expect(result[0]!.result).toContain('Title must be at most 100 characters');
    });

    it('surfaces pool validation errors for structured fields', async () => {
        const tool = new CreateTaskTool(new TaskPool());
        const badUrl = await tool.execute({ title: 'Task', links: ['not-a-url'] });
        expect(badUrl[0]!.status).toBe(ResultStatus.Error);
        expect(badUrl[0]!.result).toContain('Links items must be valid URLs');
        const badPriority = await tool.execute({ title: 'Task', priority: 'urgent' });
        expect(badPriority[0]!.status).toBe(ResultStatus.Error);
        expect(badPriority[0]!.result).toContain('Invalid priority');
    });
});
