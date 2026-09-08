import { execSync } from 'child_process';

const rawUrl = process.env.DATABASE_URL || '';

console.log('1. Ensuring PostgreSQL "midyaf" schema exists...');
if (rawUrl) {
  try {
    execSync(`echo 'CREATE SCHEMA IF NOT EXISTS "midyaf";' | npx prisma db execute --stdin --url="${rawUrl}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('Schema check complete / bypassed.');
  }
}

const isolatedUrl = rawUrl
  ? (rawUrl.includes('?') ? `${rawUrl}&schema=midyaf` : `${rawUrl}?schema=midyaf`)
  : '';

if (isolatedUrl) {
  process.env.DATABASE_URL = isolatedUrl;

  console.log('2. Pushing tables to "midyaf" schema...');
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', env: process.env });
  } catch (e) {
    console.warn('Notice during db push:', e.message);
  }

  console.log('3. Seeding initial data...');
  try {
    execSync('npx prisma db seed', { stdio: 'inherit', env: process.env });
  } catch (e) {
    console.warn('Notice during db seed (data may already exist):', e.message);
  }
}

console.log('4. Starting MIDYAF server...');
execSync('node dist/server/src/index.js', { stdio: 'inherit', env: process.env });
