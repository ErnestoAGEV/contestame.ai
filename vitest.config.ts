import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'file:./test.db',
    },
    // All test files share the one SQLite `test.db`. Running them in parallel lets
    // one file's writes leak into another's absolute-count assertions
    // (e.g. `order.count()` seeing rows a concurrent file just created). Serialize
    // files so each test's `beforeEach` deleteMany fully isolates it.
    fileParallelism: false,
  },
});
