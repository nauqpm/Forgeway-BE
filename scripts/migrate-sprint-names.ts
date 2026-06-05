import mongoose from 'mongoose';
import { Sprint, SprintSchema } from '../src/modules/scrum/schemas/sprint.schema';

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI or DATABASE_URL');
  }

  await mongoose.connect(mongoUri);
  const SprintModel = mongoose.model(Sprint.name, SprintSchema);

  const sprints = await SprintModel.find({
    $or: [{ name: { $exists: false } }, { name: null }, { name: '' }],
  }).select('_id').lean();

  for (const sprint of sprints) {
    const id = String(sprint._id);
    const suffix = id.slice(-4);
    await SprintModel.updateOne({ _id: sprint._id }, { $set: { name: `Sprint-${suffix}` } });
  }

  console.log(`Updated ${sprints.length} sprint(s) missing name.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
