import { Mongoose, Types } from 'mongoose';
import { ApprovalRecordSchema } from './approval-record.schema';

describe('ApprovalRecordSchema', () => {
  const record = {
    workspaceId: new Types.ObjectId(),
    approvalRequestId: new Types.ObjectId(),
    storyContractId: new Types.ObjectId(),
    storyVersionId: new Types.ObjectId(),
    decision: 'APPROVE',
    actorId: new Types.ObjectId(),
    createdAt: new Date(),
  };

  it('rejects repository updates, replacement, and deletion', async () => {
    const mongoose = new Mongoose();
    const Record = mongoose.model(
      'ImmutableApprovalRecordQuerySpec',
      ApprovalRecordSchema.clone(),
    );

    await expect(
      Record.updateOne({ _id: new Types.ObjectId() }, { reason: 'Changed' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPROVAL_RECORD_IMMUTABLE' }),
    });
    await expect(Record.deleteMany({})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPROVAL_RECORD_IMMUTABLE' }),
    });
  });

  it('rejects document save and delete after insertion', async () => {
    const mongoose = new Mongoose();
    mongoose.set('bufferCommands', false);
    const Record = mongoose.model(
      'ImmutableApprovalRecordDocumentSpec',
      ApprovalRecordSchema.clone(),
    );
    const approval = new Record(record);
    approval.isNew = false;
    approval.reason = 'Changed';

    await expect(approval.save()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPROVAL_RECORD_IMMUTABLE' }),
    });
    await expect(approval.deleteOne()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPROVAL_RECORD_IMMUTABLE' }),
    });
  });
});
