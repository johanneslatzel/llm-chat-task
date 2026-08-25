import { afterEach, describe, expect, it } from 'vitest';
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
} from '../../src/constants.js';
import { TaskConfiguration } from '../../src/lib/config.js';

const ENV_KEYS = [
    'LLM_CHAT_TASK_MAX_TITLE_LENGTH',
    'LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH',
    'LLM_CHAT_TASK_MAX_MILESTONE_LENGTH',
    'LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT',
    'LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH',
    'LLM_CHAT_TASK_MAX_LINKS_PER_TASK',
    'LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT',
    'LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH',
    'LLM_CHAT_TASK_MAX_HISTORY_LENGTH',
    'LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH'
] as const;

describe('TaskConfiguration', () => {
    afterEach(() => {
        for (const key of ENV_KEYS) {
            delete process.env[key];
        }
    });

    it('uses the defaults when nothing is configured', () => {
        const config = new TaskConfiguration();
        expect(config.maxTitleLength).toBe(DEFAULT_MAX_TITLE_LENGTH);
        expect(config.maxDescriptionLength).toBe(DEFAULT_MAX_DESCRIPTION_LENGTH);
        expect(config.maxMilestoneLength).toBe(DEFAULT_MAX_MILESTONE_LENGTH);
        expect(config.maxAcceptanceCriteriaCount).toBe(DEFAULT_MAX_ACCEPTANCE_CRITERIA_COUNT);
        expect(config.maxAcceptanceCriteriaLength).toBe(DEFAULT_MAX_ACCEPTANCE_CRITERIA_LENGTH);
        expect(config.maxLinksPerTask).toBe(DEFAULT_MAX_LINKS_PER_TASK);
        expect(config.maxPlanFieldCount).toBe(DEFAULT_MAX_PLAN_FIELD_COUNT);
        expect(config.maxPlanFieldLength).toBe(DEFAULT_MAX_PLAN_FIELD_LENGTH);
        expect(config.maxHistoryLength).toBe(DEFAULT_MAX_HISTORY_LENGTH);
        expect(config.historyPreviewLength).toBe(DEFAULT_HISTORY_PREVIEW_LENGTH);
    });

    it('prefers explicitly provided options over the environment', () => {
        process.env.LLM_CHAT_TASK_MAX_TITLE_LENGTH = '5';
        process.env.LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH = '10';
        process.env.LLM_CHAT_TASK_MAX_MILESTONE_LENGTH = '11';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT = '2';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH = '3';
        process.env.LLM_CHAT_TASK_MAX_LINKS_PER_TASK = '4';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT = '6';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH = '7';
        process.env.LLM_CHAT_TASK_MAX_HISTORY_LENGTH = '50';
        process.env.LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH = '5';
        const config = new TaskConfiguration({
            maxTitleLength: 20,
            maxDescriptionLength: 30,
            maxMilestoneLength: 31,
            maxAcceptanceCriteriaCount: 4,
            maxAcceptanceCriteriaLength: 5,
            maxLinksPerTask: 6,
            maxPlanFieldCount: 7,
            maxPlanFieldLength: 8,
            maxHistoryLength: 100,
            historyPreviewLength: 10
        });
        expect(config.maxTitleLength).toBe(20);
        expect(config.maxDescriptionLength).toBe(30);
        expect(config.maxMilestoneLength).toBe(31);
        expect(config.maxAcceptanceCriteriaCount).toBe(4);
        expect(config.maxAcceptanceCriteriaLength).toBe(5);
        expect(config.maxLinksPerTask).toBe(6);
        expect(config.maxPlanFieldCount).toBe(7);
        expect(config.maxPlanFieldLength).toBe(8);
        expect(config.maxHistoryLength).toBe(100);
        expect(config.historyPreviewLength).toBe(10);
    });

    it('reads values from the LLM_CHAT_TASK_* environment variables', () => {
        process.env.LLM_CHAT_TASK_MAX_TITLE_LENGTH = '12';
        process.env.LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH = '13';
        process.env.LLM_CHAT_TASK_MAX_MILESTONE_LENGTH = '14';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT = '15';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH = '16';
        process.env.LLM_CHAT_TASK_MAX_LINKS_PER_TASK = '17';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT = '18';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH = '19';
        process.env.LLM_CHAT_TASK_MAX_HISTORY_LENGTH = '50';
        process.env.LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH = '5';
        const config = new TaskConfiguration();
        expect(config.maxTitleLength).toBe(12);
        expect(config.maxDescriptionLength).toBe(13);
        expect(config.maxMilestoneLength).toBe(14);
        expect(config.maxAcceptanceCriteriaCount).toBe(15);
        expect(config.maxAcceptanceCriteriaLength).toBe(16);
        expect(config.maxLinksPerTask).toBe(17);
        expect(config.maxPlanFieldCount).toBe(18);
        expect(config.maxPlanFieldLength).toBe(19);
        expect(config.maxHistoryLength).toBe(50);
        expect(config.historyPreviewLength).toBe(5);
    });

    it('falls back to defaults when an environment value is invalid', () => {
        process.env.LLM_CHAT_TASK_MAX_TITLE_LENGTH = 'nope';
        process.env.LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH = 'nope';
        process.env.LLM_CHAT_TASK_MAX_MILESTONE_LENGTH = '0';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT = '';
        process.env.LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH = '';
        process.env.LLM_CHAT_TASK_MAX_LINKS_PER_TASK = '0';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT = '0';
        process.env.LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH = '0';
        process.env.LLM_CHAT_TASK_MAX_HISTORY_LENGTH = 'nope';
        process.env.LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH = '0';
        const config = new TaskConfiguration();
        expect(config.maxTitleLength).toBe(DEFAULT_MAX_TITLE_LENGTH);
        expect(config.maxDescriptionLength).toBe(DEFAULT_MAX_DESCRIPTION_LENGTH);
        expect(config.maxMilestoneLength).toBe(1);
        expect(config.maxAcceptanceCriteriaCount).toBe(DEFAULT_MAX_ACCEPTANCE_CRITERIA_COUNT);
        expect(config.maxAcceptanceCriteriaLength).toBe(DEFAULT_MAX_ACCEPTANCE_CRITERIA_LENGTH);
        expect(config.maxLinksPerTask).toBe(1);
        expect(config.maxPlanFieldCount).toBe(1);
        expect(config.maxPlanFieldLength).toBe(1);
        expect(config.maxHistoryLength).toBe(DEFAULT_MAX_HISTORY_LENGTH);
        expect(config.historyPreviewLength).toBe(1);
    });
});
