import {
    DEFAULT_MAX_ACCEPTANCE_CRITERIA_COUNT,
    DEFAULT_MAX_ACCEPTANCE_CRITERIA_LENGTH,
    DEFAULT_MAX_DESCRIPTION_LENGTH,
    DEFAULT_MAX_HISTORY_LENGTH,
    DEFAULT_MAX_LINKS_PER_TASK,
    DEFAULT_MAX_MILESTONE_LENGTH,
    DEFAULT_MAX_PLAN_FIELD_COUNT,
    DEFAULT_MAX_PLAN_FIELD_LENGTH,
    DEFAULT_MAX_TITLE_LENGTH,
    DEFAULT_HISTORY_PREVIEW_LENGTH
} from '../constants.js';
import { envInt } from '../env.js';

/** Options for {@link TaskConfiguration}. Omitted options fall back to `LLM_CHAT_TASK_*` env vars, then defaults. */
export type TaskConfigurationOptions = {
    maxTitleLength?: number;
    maxDescriptionLength?: number;
    maxMilestoneLength?: number;
    maxAcceptanceCriteriaCount?: number;
    maxAcceptanceCriteriaLength?: number;
    maxLinksPerTask?: number;
    maxPlanFieldCount?: number;
    maxPlanFieldLength?: number;
    maxHistoryLength?: number;
    historyPreviewLength?: number;
};

/** Configuration for task limits. Explicit options win; otherwise `LLM_CHAT_TASK_*` env vars; otherwise defaults. */
export class TaskConfiguration {
    /** Maximum title length after trimming (env: `LLM_CHAT_TASK_MAX_TITLE_LENGTH`). */
    maxTitleLength: number;

    /** Maximum description length after trimming (env: `LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH`). */
    maxDescriptionLength: number;

    /** Maximum milestone length after trimming (env: `LLM_CHAT_TASK_MAX_MILESTONE_LENGTH`). */
    maxMilestoneLength: number;

    /** Maximum number of acceptance criteria items (env: `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT`). */
    maxAcceptanceCriteriaCount: number;

    /** Maximum length of a single acceptance criteria item (env: `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH`). */
    maxAcceptanceCriteriaLength: number;

    /** Maximum number of reference links per task (env: `LLM_CHAT_TASK_MAX_LINKS_PER_TASK`). */
    maxLinksPerTask: number;

    /** Maximum number of items in each plan array (env: `LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT`). */
    maxPlanFieldCount: number;

    /** Maximum length of a single plan array item (env: `LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH`). */
    maxPlanFieldLength: number;

    /** Maximum total progress-log length (env: `LLM_CHAT_TASK_MAX_HISTORY_LENGTH`). */
    maxHistoryLength: number;

    /** Progress-log preview length in task listings (env: `LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH`). */
    historyPreviewLength: number;

    constructor(options?: TaskConfigurationOptions) {
        this.maxTitleLength =
            options?.maxTitleLength ??
            envInt('LLM_CHAT_TASK_MAX_TITLE_LENGTH', DEFAULT_MAX_TITLE_LENGTH, 1);
        this.maxDescriptionLength =
            options?.maxDescriptionLength ??
            envInt('LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH', DEFAULT_MAX_DESCRIPTION_LENGTH, 1);
        this.maxMilestoneLength =
            options?.maxMilestoneLength ??
            envInt('LLM_CHAT_TASK_MAX_MILESTONE_LENGTH', DEFAULT_MAX_MILESTONE_LENGTH, 1);
        this.maxAcceptanceCriteriaCount =
            options?.maxAcceptanceCriteriaCount ??
            envInt(
                'LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT',
                DEFAULT_MAX_ACCEPTANCE_CRITERIA_COUNT,
                1
            );
        this.maxAcceptanceCriteriaLength =
            options?.maxAcceptanceCriteriaLength ??
            envInt(
                'LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH',
                DEFAULT_MAX_ACCEPTANCE_CRITERIA_LENGTH,
                1
            );
        this.maxLinksPerTask =
            options?.maxLinksPerTask ??
            envInt('LLM_CHAT_TASK_MAX_LINKS_PER_TASK', DEFAULT_MAX_LINKS_PER_TASK, 1);
        this.maxPlanFieldCount =
            options?.maxPlanFieldCount ??
            envInt('LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT', DEFAULT_MAX_PLAN_FIELD_COUNT, 1);
        this.maxPlanFieldLength =
            options?.maxPlanFieldLength ??
            envInt('LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH', DEFAULT_MAX_PLAN_FIELD_LENGTH, 1);
        this.maxHistoryLength =
            options?.maxHistoryLength ??
            envInt('LLM_CHAT_TASK_MAX_HISTORY_LENGTH', DEFAULT_MAX_HISTORY_LENGTH, 1);
        this.historyPreviewLength =
            options?.historyPreviewLength ??
            envInt('LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH', DEFAULT_HISTORY_PREVIEW_LENGTH, 1);
    }
}
