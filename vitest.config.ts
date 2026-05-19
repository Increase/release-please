import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.ts'],
    exclude: [
      ...configDefaults.exclude,
      '__snapshots__/**',
      'build/**',
      'dist/**',
      'test/helpers.ts',
      'test/setup.ts',
      'test/msw.ts',
      'test/http-mock.ts',
      'test/vitest-env.d.ts',
    ],
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    snapshotFormat: {
      printBasicPrototype: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
  ssr: {
    noExternal: ['@iarna/toml'],
  },
});
