import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llm-chat-task-test-'));
    return dir;
}

export function removeTempDir(dir: string): void {
    if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
    }
}

export function createTempFile(dir: string, relativePath: string, content: string): string {
    const fullPath = resolve(dir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
}
