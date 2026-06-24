import 'dotenv/config';
import mongoose from 'mongoose';

type ExplainStats = {
  executionTimeMillis?: number;
  totalDocsExamined?: number;
  totalKeysExamined?: number;
  winningPlan?: string;
};

const getStats = (explain: any): ExplainStats => {
  const stats = explain.executionStats ?? {};
  const plan = explain.queryPlanner?.winningPlan;
  const stage = plan?.stage ?? plan?.inputStage?.stage ?? 'unknown';
  return {
    executionTimeMillis: stats.executionTimeMillis,
    totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined,
    winningPlan: stage,
  };
};

async function main() {
  const uri = process.env.DB_CONNECTION_STRING;
  if (!uri) throw new Error('DB_CONNECTION_STRING is required');

  const query = (process.env.SEARCH_BENCHMARK_QUERY ?? 'search').trim();
  if (query.length < 2)
    throw new Error('SEARCH_BENCHMARK_QUERY must be at least 2 characters');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const comments = mongoose.connection.collection('comments');
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const filter = { isDeleted: { $ne: true }, content: regex };

  const [count, indexes, explain] = await Promise.all([
    comments.countDocuments(filter),
    comments.indexes(),
    comments
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(21)
      .explain('executionStats'),
  ]);

  console.log(
    JSON.stringify(
      {
        query,
        matchingComments: count,
        existingIndexes: indexes.map(index => index.name),
        globalSearchCommentExplain: getStats(explain),
        recommendation:
          'No Comment text index was created. Add one only after comparing this baseline with a proposed index in the target dataset.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(
    `Global-search benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});
