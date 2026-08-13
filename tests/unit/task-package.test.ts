import { describe, it, expect } from 'vitest';
import { TaskPool, TaskToolPackage } from '../../src/index.js';
import { CreateTaskTool } from '../../src/tools/create-task.js';
import { ReadTaskTool } from '../../src/tools/read-task.js';
import { UpdateTaskTool } from '../../src/tools/update-task.js';

describe('TaskToolPackage', () => {
    it('bundles all three task tools', () => {
        const pkg = new TaskToolPackage(new TaskPool());
        const tools = pkg.tools();
        expect(tools).toHaveLength(3);
        expect(tools[0]).toBeInstanceOf(CreateTaskTool);
        expect(tools[1]).toBeInstanceOf(ReadTaskTool);
        expect(tools[2]).toBeInstanceOf(UpdateTaskTool);
        expect(tools.map((t) => t.name)).toEqual(['create_task', 'read_task', 'update_task']);
    });

    it('shares the same pool across all tools', async () => {
        const pool = new TaskPool();
        const pkg = new TaskToolPackage(pool);
        const createResult = await pkg.tools()[0]!.execute({ title: 'shared' });
        const id = createResult[0]!.result.split('id: ')[1];
        expect(pool.getTasks()).toHaveLength(1);
        expect(pool.getTasks()[0]!.id).toBe(id);
    });

    it('returns tutorial content', () => {
        const pkg = new TaskToolPackage(new TaskPool());
        const tutorial = pkg.tutorial();
        expect(tutorial).toContain('Tasks');
        expect(tutorial).toContain('create_task');
        expect(tutorial).toContain('read_task');
        expect(tutorial).toContain('update_task');
        expect(tutorial).toContain('acceptance_criteria');
        expect(tutorial).toContain('steps');
        expect(tutorial).toContain('constraints');
        expect(tutorial).toContain('out_of_scope');
        expect(tutorial).toContain('verification');
        expect(tutorial).toContain('edge_cases');
        expect(tutorial).toContain('priority');
        expect(tutorial).toContain('type');
    });
});
