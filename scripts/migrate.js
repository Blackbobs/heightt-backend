const { exec } = require('child_process');

console.log('Running database migrations...');
exec('npx prisma migrate deploy', (error, stdout, stderr) => {
  if (error) {
    console.error(`Migration error: ${error}`);
    process.exit(1);
  }
  console.log(stdout);
  if (stderr) console.error(stderr);
  console.log('Migrations completed successfully!');
  process.exit(0);
});