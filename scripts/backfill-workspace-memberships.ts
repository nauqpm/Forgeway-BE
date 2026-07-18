import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  runWorkspaceMembershipBackfill,
  WorkspaceMembershipBackfillMode,
} from '../src/modules/workspaces/services/workspace-membership-backfill.runner';

const mode = process.argv[2] ?? 'dry-run';
if (!['dry-run', 'apply', 'verify'].includes(mode))
  throw new Error('Use dry-run, apply, or verify');
if (mode === 'apply' && !process.argv.includes('--confirm'))
  throw new Error('Apply requires --confirm');
const uri = process.env.DB_CONNECTION_STRING;
if (!uri) throw new Error('DB_CONNECTION_STRING is required');

async function main(): Promise<void> {
  const client = new MongoClient(uri!);
  await client.connect();
  try {
    const report = await runWorkspaceMembershipBackfill(
      client.db(),
      mode as WorkspaceMembershipBackfillMode,
    );
    console.log(JSON.stringify({ mode, ...report }));
  } finally {
    await client.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
