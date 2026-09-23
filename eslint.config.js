import js from '@eslint/js';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import nodePlugin from 'eslint-plugin-n';
import eslintConfigPrettier from 'eslint-config-prettier';

const recommendedTSConfigs = tseslintPlugin.configs['flat/recommended'].map(
    (config) => ({
        ...config,
        files: ['**/*.ts']
    })
);

export default [
    js.configs.recommended,
    ...recommendedTSConfigs,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: true
            },
            globals: {}
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-deprecated': 'warn'
        }
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                module: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly'
            }
        },
        plugins: {
            node: nodePlugin
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
        }
    },
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'coverage/**',
            'vitest.config.ts'
        ]
    },
    eslintConfigPrettier
];
