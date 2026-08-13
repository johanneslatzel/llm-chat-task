import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import { CreateTaskInput, TaskPool } from '../pool.js';
import type { TaskPriority, TaskType } from '../types.js';

/** Creates a task with a structured description, acceptance criteria, and an embedded plan. */
export class CreateTaskTool extends Tool {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super(
            'create_task',
            'Use this tool to create a new task that needs to be accomplished. A task carries a ' +
                'concise title plus structured fields that together form a small plan for doing the work. ' +
                'Fill every field that adds value: a vague task is not actionable.\n\n' +
                '- title (required): a short, specific, imperative phrase, e.g. "Add phone validation to ' +
                'UserService" (at most ' +
                pool.config.maxTitleLength +
                ' characters).\n' +
                '- description: what to do and why. State the goal, and current vs expected behavior ' +
                'where relevant. This is prose, not implementation steps.\n' +
                '- acceptance_criteria: testable definition of done. Write each item so it has an ' +
                'unambiguous pass/fail outcome; use Given/When/Then scenarios or a checklist. ' +
                'At most ' +
                pool.config.maxAcceptanceCriteriaCount +
                ' items, each at most ' +
                pool.config.maxAcceptanceCriteriaLength +
                ' characters.\n' +
                '- steps: the ordered execution plan, one concrete action per item.\n' +
                '- context: relevant files, entry points, existing patterns, and architectural ' +
                'decisions the executor cannot infer from the code alone.\n' +
                '- constraints: rules that must hold, e.g. "No new dependencies" or "Match the ' +
                'existing validation pattern". Include both must-do and must-not-do rules.\n' +
                '- out_of_scope: work explicitly excluded so the executor does not over-reach.\n' +
                '- verification: commands or checks that confirm the work is done, e.g. "npm run ' +
                'verify" or a curl invocation.\n' +
                '- edge_cases: known pitfalls, footguns, and edge conditions to watch for.\n' +
                '- priority: stated importance (low, medium, high); omit when there is no urgency.\n' +
                '- type: kind of work (feature, bug, refactor, chore, research).\n' +
                '- links: reference URLs such as docs, issues, or designs.',
            new ToolParameters(
                {
                    title: ToolParameterProperty.string(
                        'Short, specific, imperative title for the task. Required; at most ' +
                            pool.config.maxTitleLength +
                            ' characters.'
                    ),
                    description: ToolParameterProperty.string(
                        'What to do and why: the goal, including current vs expected behavior where relevant. At most ' +
                            pool.config.maxDescriptionLength +
                            ' characters.'
                    ),
                    acceptance_criteria: ToolParameterProperty.array(
                        'Testable definition of done. Each item must have an unambiguous pass/fail outcome; use Given/When/Then scenarios or a checklist. At most ' +
                            pool.config.maxAcceptanceCriteriaCount +
                            ' items, each at most ' +
                            pool.config.maxAcceptanceCriteriaLength +
                            ' characters.'
                    ),
                    steps: ToolParameterProperty.array(
                        'Ordered execution steps, one concrete action per item. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    context: ToolParameterProperty.array(
                        'Relevant files, entry points, existing patterns, and architectural decisions the executor cannot infer from the code. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    constraints: ToolParameterProperty.array(
                        'Rules that must hold: must-do and must-not-do guardrails. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    out_of_scope: ToolParameterProperty.array(
                        'Work explicitly excluded so the executor does not over-reach. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    verification: ToolParameterProperty.array(
                        'Commands or checks that confirm the work is complete. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    edge_cases: ToolParameterProperty.array(
                        'Known pitfalls, footguns, and edge conditions to watch for. At most ' +
                            pool.config.maxPlanFieldCount +
                            ' items, each at most ' +
                            pool.config.maxPlanFieldLength +
                            ' characters.'
                    ),
                    priority: ToolParameterProperty.string(
                        'Stated importance: low, medium or high. Omit when there is no urgency.'
                    ),
                    type: ToolParameterProperty.string(
                        'Kind of work: feature, bug, refactor, chore or research.'
                    ),
                    links: ToolParameterProperty.array(
                        'Reference URLs such as docs, issues, or designs. At most ' +
                            pool.config.maxLinksPerTask +
                            ' items, each a valid URL.'
                    )
                },
                ['title']
            )
        );
        this.pool = pool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        if (args.title === undefined || typeof args.title !== 'string') {
            return {
                result: "Required parameter 'title' is missing or not a string",
                status: ResultStatus.Error
            };
        }
        try {
            const input = this.toCreateTaskInput(args);
            const taskId = await this.pool.createTask(input);
            return {
                result: 'Task created with id: ' + taskId,
                status: ResultStatus.Success
            };
        } catch (e) {
            return { result: (e as Error).message, status: ResultStatus.Error };
        }
    }

    private toCreateTaskInput(args: Record<string, unknown>): CreateTaskInput {
        const input: CreateTaskInput = { title: args.title as string };
        if (typeof args.description === 'string') {
            input.description = args.description;
        }
        if (Array.isArray(args.acceptance_criteria)) {
            input.acceptanceCriteria = args.acceptance_criteria as string[];
        }
        if (typeof args.priority === 'string') {
            input.priority = args.priority as TaskPriority;
        }
        if (typeof args.type === 'string') {
            input.type = args.type as TaskType;
        }
        if (Array.isArray(args.links)) {
            input.links = args.links as string[];
        }
        if (Array.isArray(args.steps)) {
            input.steps = args.steps as string[];
        }
        if (Array.isArray(args.context)) {
            input.context = args.context as string[];
        }
        if (Array.isArray(args.constraints)) {
            input.constraints = args.constraints as string[];
        }
        if (Array.isArray(args.out_of_scope)) {
            input.outOfScope = args.out_of_scope as string[];
        }
        if (Array.isArray(args.verification)) {
            input.verification = args.verification as string[];
        }
        if (Array.isArray(args.edge_cases)) {
            input.edgeCases = args.edge_cases as string[];
        }
        return input;
    }
}
