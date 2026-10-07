// ESLint flat config. Run `npm run lint:fix` before every commit (enforced by .githooks/pre-commit).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['node_modules/', 'build/', 'data/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // matches tsconfig verbatimModuleSyntax: type-only imports are written as `import type`
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
    },
  },
);
