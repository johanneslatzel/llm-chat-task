/** Default maximum length of a task title (after trimming). */
export const DEFAULT_MAX_TITLE_LENGTH = 100;

/** Default maximum length of a task description (after trimming). */
export const DEFAULT_MAX_DESCRIPTION_LENGTH = 500;

/**
 * Default maximum length of a task milestone (after trimming). Milestones are
 * identifier-style labels: printable ASCII without whitespace.
 */
export const DEFAULT_MAX_MILESTONE_LENGTH = 64;

/** Default maximum number of acceptance criteria items. */
export const DEFAULT_MAX_ACCEPTANCE_CRITERIA_COUNT = 10;

/** Default maximum length of a single acceptance criteria item. */
export const DEFAULT_MAX_ACCEPTANCE_CRITERIA_LENGTH = 200;

/** Default maximum number of reference links per task. */
export const DEFAULT_MAX_LINKS_PER_TASK = 20;

/** Default maximum number of items in each plan array (steps, constraints, etc.). */
export const DEFAULT_MAX_PLAN_FIELD_COUNT = 20;

/** Default maximum length of a single plan array item. */
export const DEFAULT_MAX_PLAN_FIELD_LENGTH = 300;

/** Default maximum total length of a task's progress log. */
export const DEFAULT_MAX_HISTORY_LENGTH = 10_000;

/** Default preview length used when listing tasks (full log only in single-task reads). */
export const DEFAULT_HISTORY_PREVIEW_LENGTH = 200;

/** Minimum number of characters for a shortened task id prefix accepted by `TaskPool.resolveId`. */
export const MIN_ID_PREFIX_LENGTH = 8;
