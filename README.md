# LLM Chat Task

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM](https://nodei.co/npm/@johannes.latzel/llm-chat-task.svg?style=shields&data=n,v,u,d,s)](https://www.npmjs.com/package/@johannes.latzel/llm-chat-task)
[![version](https://img.shields.io/github/package-json/v/johanneslatzel/llm-chat-task)](https://github.com/johanneslatzel/llm-chat-task/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/johanneslatzel/llm-chat-task/pulls)
[![Feedback Welcome](https://img.shields.io/badge/feedback-welcome-brightgreen)](https://github.com/johanneslatzel/llm-chat-task/discussions)
[![codecov](https://codecov.io/gh/johanneslatzel/llm-chat-task/graph/badge.svg)](https://codecov.io/gh/johanneslatzel/llm-chat-task)
[![CI](https://github.com/johanneslatzel/llm-chat-task/actions/workflows/ci.yml/badge.svg)](https://github.com/johanneslatzel/llm-chat-task/actions/workflows/ci.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/@johannes.latzel/llm-chat-task/latest)](https://badge.socket.dev/npm/package/@johannes.latzel/llm-chat-task/latest)
[![AI Assisted Yes](https://img.shields.io/badge/AI%20Assisted-Yes-green)](https://github.com/mefengl/made-by-ai)

Task pool and task management tools for the `llm-chat` ecosystem. Lets an agent
track work items, order them with dependencies, pick the next available task,
and record results. Each task carries a short title plus structured plan fields
— description, acceptance criteria, priority, type, reference links, and plan
arrays for steps, context, constraints, out-of-scope work, verification, and
edge cases — so tasks read as small, executable specs.

## Features

- in-memory task store with dependency tracking, cycle detection, and optional file persistence
- structured tasks: title (required) + description, acceptance criteria, priority, type, links, and plan arrays
- instructive tool descriptions that coach the LLM on how to fill each field
- `read_task` filters by status, priority, and type

## Prerequisites

- Node.js >= 18

## Installation

```bash
npm install @johannes.latzel/llm-chat-task
```

## Documentation

Full documentation at **[johanneslatzel.github.io/llm-chat-task/](https://johanneslatzel.github.io/llm-chat-task/)**

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

Issues and PRs welcome at [github.com/johanneslatzel/llm-chat-task](https://github.com/johanneslatzel/llm-chat-task).
