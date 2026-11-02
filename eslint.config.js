import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Only affects hot reload during development, and every context and shadcn file trips it
      'react-refresh/only-export-components': 'off',
      // A catch left empty on purpose: best-effort native and storage calls
      'no-empty': ['error', { allowEmptyCatch: true }],
      // _name is unused on purpose, and { id, ...rest } is how a field gets dropped
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // React Native: require() loads images and optional native modules, and Reanimated's shared values are written with .value
    files: ['mobile/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/immutability': 'off',
    },
  },
])
