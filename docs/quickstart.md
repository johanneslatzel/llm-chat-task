# Quick Start

## Installation

```bash
npm install @johannes.latzel/llm-chat-task
```

## Quick setup

```typescript
import { TaskPool, TaskToolPackage } from '@johannes.latzel/llm-chat-task';

const pool = new TaskPool();
const pkg = new TaskToolPackage(pool);
service.tools().add(pkg);
```

Or use the tools individually:

```typescript
import { TaskPool, CreateTaskTool, ReadTaskTool, UpdateTaskTool } from '@johannes.latzel/llm-chat-task';

const pool = new TaskPool();
const create = new CreateTaskTool(pool);
const createResult = await create.execute({
    title: 'Add phone validation',
    description: 'Reject malformed phone numbers at the service layer.',
    acceptance_criteria: ['Valid E.164 numbers pass', 'Invalid numbers return an error'],
    priority: 'high',
    type: 'feature',
    steps: ['Add ValidatePhone', 'Add table-driven tests'],
    verification: ['npm run verify']
});
const taskId = createResult[0]!.result.split('id: ')[1];
// ...
const update = new UpdateTaskTool(pool);
await update.execute({ id: taskId, status: 'in_progress', history: 'Started' });
await update.execute({ id: taskId, history: 'Found the cause' });
await update.execute({ id: taskId, status: 'done', history: 'All tests pass' });
const read = new ReadTaskTool(pool);
await read.execute({ id: taskId });
```

Persistence is manual: call `pool.save(path)` to write the pool and
`pool.loadFromFile(path)` (or `TaskPool.load(path)`) to restore it.

## Next steps

See the [API Reference](api-reference.md) for full tool documentation and [Architecture](architecture.md) for design details.
