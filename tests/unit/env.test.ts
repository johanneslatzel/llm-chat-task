import { describe, expect, it } from 'vitest';
import { envInt } from '../../src/env.js';

describe('envInt', () => {
    it('returns the fallback when the variable is unset', () => {
        delete process.env.TEST_ENV_INT;
        expect(envInt('TEST_ENV_INT', 42)).toBe(42);
    });

    it('returns the fallback when the variable is empty', () => {
        process.env.TEST_ENV_INT = '';
        expect(envInt('TEST_ENV_INT', 42)).toBe(42);
    });

    it('returns the fallback when the variable is not a number', () => {
        process.env.TEST_ENV_INT = 'abc';
        expect(envInt('TEST_ENV_INT', 42)).toBe(42);
    });

    it('returns the parsed value when it is valid', () => {
        process.env.TEST_ENV_INT = '12';
        expect(envInt('TEST_ENV_INT', 42)).toBe(12);
    });

    it('clamps values below the minimum to the minimum', () => {
        process.env.TEST_ENV_INT = '0';
        expect(envInt('TEST_ENV_INT', 42, 5)).toBe(5);
    });
});
