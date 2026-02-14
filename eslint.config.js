import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['src/**/*.js', 'test/**/*.js', 'bin/**/*.js', 'build.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'eqeqeq': ['warn', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['bin/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['build.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  prettier,
];
