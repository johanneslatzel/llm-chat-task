# Environment Variables

`TaskConfiguration` reads each setting from a `LLM_CHAT_TASK_*` environment
variable when no explicit option is given, falling back to the `DEFAULT_*`
constant. Values read from the environment are clamped to a minimum of 1;
invalid values (empty, non-numeric, too small) fall back to the default or
clamp to 1.

| Variable                                       | Type   | Default | Description                                                  |
| ---------------------------------------------- | ------ | ------- | ------------------------------------------------------------ |
| `LLM_CHAT_TASK_DIR`                            | string | (none)  | Persistence directory; unset means a fresh in-memory store.  |
| `LLM_CHAT_TASK_MAX_TITLE_LENGTH`               | number | 100     | Maximum title length after trimming.                         |
| `LLM_CHAT_TASK_MAX_DESCRIPTION_LENGTH`         | number | 500     | Maximum description length after trimming.                   |
| `LLM_CHAT_TASK_MAX_MILESTONE_LENGTH`           | number | 64      | Maximum milestone length after trimming.                     |
| `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_COUNT`  | number | 10      | Maximum number of acceptance criteria items.                 |
| `LLM_CHAT_TASK_MAX_ACCEPTANCE_CRITERIA_LENGTH` | number | 200     | Maximum length of a single acceptance criteria item.         |
| `LLM_CHAT_TASK_MAX_LINKS_PER_TASK`             | number | 20      | Maximum number of reference links per task.                  |
| `LLM_CHAT_TASK_MAX_PLAN_FIELD_COUNT`           | number | 20      | Maximum number of items in each plan array.                  |
| `LLM_CHAT_TASK_MAX_PLAN_FIELD_LENGTH`          | number | 300     | Maximum length of a single plan array item.                  |
| `LLM_CHAT_TASK_MAX_HISTORY_LENGTH`             | number | 10,000  | Maximum total progress-log length.                           |
| `LLM_CHAT_TASK_HISTORY_PREVIEW_LENGTH`         | number | 200     | Preview length for long text fields in task listings.        |

The variables are read when the `TaskConfiguration` is constructed, so a pool
enforces its limits consistently for its whole lifetime. See the
[API Reference](api-reference.md#taskconfiguration) for the full options
table.