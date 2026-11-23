import { createEnvReader, NumberParsing, RangePolicy } from '@johannes.latzel/env';

function makeEnv() {
    return createEnvReader({
        numberParsing: NumberParsing.Strict,
        rangePolicy: RangePolicy.Clamp,
    });
}

/** Reads a positive integer from the environment, falling back to `fallback`. */
export function envInt(key: string, fallback: number, min = 1): number {
    return makeEnv().int(key, Math.max(min, fallback), min);
}
