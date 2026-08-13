import { execSync } from 'node:child_process';

execSync('npx prisma db push --skip-generate', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
});
