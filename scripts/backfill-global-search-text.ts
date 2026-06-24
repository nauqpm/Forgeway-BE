import 'dotenv/config';
import mongoose from 'mongoose';
import type { Collection, ObjectId } from 'mongodb';
import { normalizeForSearch } from '../src/common/utils/normalizeForSearch';

type SearchDocument = {
  _id: ObjectId;
  title?: string;
  content?: string;
  plainTextSnapshot?: string;
  slug?: string;
  key?: string;
  description?: string;
  name?: string;
};

const BATCH_SIZE = 500;

const pageSearchText = (page: SearchDocument) =>
  normalizeForSearch(
    [page.title, page.plainTextSnapshot || page.content, page.slug].join(' '),
  );
const commentSearchText = (comment: SearchDocument) =>
  normalizeForSearch(comment.content || '');
const taskSearchText = (task: SearchDocument) =>
  normalizeForSearch([task.key, task.title, task.description].join(' '));
const workspaceSearchText = (workspace: SearchDocument) =>
  normalizeForSearch([workspace.name, workspace.key, workspace.description].join(' '));

async function backfill(
  collection: Collection<SearchDocument>,
  buildSearchText: (document: SearchDocument) => string,
) {
  let updated = 0;
  let batch: any[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const result = await collection.bulkWrite(batch, { ordered: false });
    updated += result.modifiedCount;
    batch = [];
  };

  const cursor = collection.find({}, { projection: { title: 1, content: 1, plainTextSnapshot: 1, slug: 1, key: 1, description: 1, name: 1 } });
  for await (const document of cursor) {
    batch.push({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: { searchText: buildSearchText(document) } },
      },
    });
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return updated;
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING;
  if (!uri) throw new Error('Missing MONGODB_URI, DATABASE_URL, or DB_CONNECTION_STRING');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is unavailable');

  const [pages, comments, tasks, workspaces] = await Promise.all([
    backfill(db.collection<SearchDocument>('pages'), pageSearchText),
    backfill(db.collection<SearchDocument>('comments'), commentSearchText),
    backfill(db.collection<SearchDocument>('tasks'), taskSearchText),
    backfill(db.collection<SearchDocument>('workspaces'), workspaceSearchText),
  ]);

  console.log(`Backfilled searchText: ${pages} pages, ${comments} comments, ${tasks} tasks, ${workspaces} workspaces.`);
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
