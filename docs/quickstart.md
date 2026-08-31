# Quick Start

## Installation

```bash
npm install @johannes.latzel/llm-chat-task
```

## Quick setup

```typescript
import { TaskPool, TaskToolPackage } from '@johannes.latzel/llm-chat-task';

const pool = await TaskPool.create();
const pkg = new TaskToolPackage(pool);
service.tools().add(pkg);
```

Persistence is store-backed: every `TaskPool` is backed by an `ObjectStore`.
Without a configured `dir` that is an in-memory store; set `dir` (option or
`LLM_CHAT_TASK_DIR` env var) to persist to a directory and pre-load any stored
tasks:

```typescript
import { TaskConfiguration, TaskPool } from '@johannes.latzel/llm-chat-task';

const pool = await TaskPool.create(new TaskConfiguration({ dir: './tasks' }));
// createTask/updateTask auto-persist; existing tasks are loaded on create
```

## Next steps

See the [API Reference](api-reference.md) for full tool documentation and [Architecture](architecture.md) for design details.