/** Reads a positive integer from the environment, falling back to `fallback`. */
export function envInt(key: string, fallback: number, min = 1): number {
    const raw = process.env[key];
    if (raw === undefined || raw === '') {
        return Math.max(min, fallback);
    }
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? Math.max(min, fallback) : Math.max(min, parsed);
}
