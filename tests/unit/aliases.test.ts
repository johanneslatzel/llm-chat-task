import { describe, it, expect } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import { CreateTaskTool, TaskPool, UpdateTaskTool } from '../../src/index.js';

const ALIAS_PAIRS = [
    ['acceptance_criteria', 'acceptance_criterion'],
    ['steps', 'step'],
    ['constraints', 'constraint'],
    ['edge_cases', 'edge_case'],
    ['links', 'link'],
] as const;

describe('hidden singular aliases', () => {
    it('does not expose the aliases in the schemas', async () => {
        const pool = await TaskPool.create();
        const tools = [new CreateTaskTool(pool), new UpdateTaskTool(pool)];

        for (const tool of tools) {
            const parameters = tool.toOpenAI().function.parameters as {
                properties: Record<string, unknown>;
            };
            for (const [canonical, alias] of ALIAS_PAIRS) {
                expect(parameters.properties[canonical]).toBeDefined();
                expect(parameters.properties[alias]).toBeUndefined();
            }
        }
    });

    it('creates a task through singular aliases', async () => {
        const pool = await TaskPool.create();
        const result = await new CreateTaskTool(pool).execute({
            title: 'Aliased task',
            acceptance_criterion: 'criterion',
            step: 'step',
            constraint: 'constraint',
            edge_case: 'edge case',
            link: 'https://example.com',
        });

        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = pool.getTasks()[0]!;
        expect(task.acceptanceCriteria).toEqual(['criterion']);
        expect(task.steps).toEqual(['step']);
        expect(task.constraints).toEqual(['constraint']);
        expect(task.edgeCases).toEqual(['edge case']);
        expect(task.links).toEqual(['https://example.com']);
    });

    it('updates a task through singular aliases', async () => {
        const pool = await TaskPool.create();
        const id = await pool.createTask({ title: 'Task A' });
        const result = await new UpdateTaskTool(pool).execute({
            id,
            acceptance_criterion: 'criterion',
            step: 'step',
            constraint: 'constraint',
            edge_case: 'edge case',
            link: 'https://example.com',
        });

        expect(result[0]!.status).toBe(ResultStatus.Success);
        const task = pool.getTask(id)!;
        expect(task.acceptanceCriteria).toEqual(['criterion']);
        expect(task.steps).toEqual(['step']);
        expect(task.constraints).toEqual(['constraint']);
        expect(task.edgeCases).toEqual(['edge case']);
        expect(task.links).toEqual(['https://example.com']);
    });
});
