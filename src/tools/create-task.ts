import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import { applyStructuredFields } from '../lib/fields.js';
import { CreateTaskInput, TaskPool } from '../pool.js';

/** Creates a task with a structured description, acceptance criteria, and an embedded plan. */
export class CreateTaskTool extends Tool {
    private readonly pool: TaskPool;

    constructor(pool: TaskPool) {
        super(
            'create_task',
            'Use this tool to create a new task that needs to be accomplished. A task carries a ' +
                'concise title plus optional structured plan fields that together form a small plan ' +
                'for doing the work. Fill every field that adds value: a vague task is not actionable. ' +
                'See the parameter descriptions for the semantics and limits of each field.',
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
                    milestone: ToolParameterProperty.string(
                        'Optional identifier-style grouping label tying the task to a milestone, e.g. ' +
                            'release-2026-q3. Printable ASCII without whitespace, at most ' +
                            pool.config.maxMilestoneLength +
                            ' characters; an empty or whitespace-only value stores no milestone.'
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
                        'Stated importance: low, medium or high. Defaults to low when omitted.'
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
        applyStructuredFields(args, input);
        return input;
    }
}
