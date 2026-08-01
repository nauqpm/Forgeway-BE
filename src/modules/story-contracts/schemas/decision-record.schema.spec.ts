import { Mongoose, Types } from 'mongoose';
import { DecisionRecordSchema } from './decision-record.schema';

describe('DecisionRecordSchema', () => {
  const record = {
    workspaceId: new Types.ObjectId(),
    storyContractId: new Types.ObjectId(),
    sourceProposalId: new Types.ObjectId(),
    question: 'Use Mongo?',
    selectedOption: 'yes',
    rationale: 'Existing stack',
    decidedBy: new Types.ObjectId(),
    decidedAt: new Date(),
  };

  it('rejects repository updates, replacement, and deletion', async () => {
    const mongoose = new Mongoose();
    const Record = mongoose.model(
      'ImmutableDecisionRecordQuerySpec',
      DecisionRecordSchema.clone(),
    );

    await expect(
      Record.replaceOne({ _id: new Types.ObjectId() }, record),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DECISION_RECORD_IMMUTABLE' }),
    });
    await expect(Record.deleteMany({})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DECISION_RECORD_IMMUTABLE' }),
    });
  });

  it('rejects document save and delete after insertion', async () => {
    const mongoose = new Mongoose();
    mongoose.set('bufferCommands', false);
    const Record = mongoose.model(
      'ImmutableDecisionRecordDocumentSpec',
      DecisionRecordSchema.clone(),
    );
    const decision = new Record(record);
    decision.isNew = false;
    decision.rationale = 'Changed';
    await expect(decision.save()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DECISION_RECORD_IMMUTABLE' }),
    });
    await expect(decision.deleteOne()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DECISION_RECORD_IMMUTABLE' }),
    });
  });
});
