const { execSync } = require('child_process');

try {
  console.log('Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('Migrations completed.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}

console.log('Starting the application...');
require('../dist/src/main');