import { Types } from 'mongoose';

import { WorkspacesRepository } from './workspaces.repository';

describe('WorkspacesRepository', () => {
  it('returns raw member ObjectIds from findByUserId without population', async () => {
    const userId = new Types.ObjectId().toString();
    const workspaces = [{ _id: new Types.ObjectId() }];
    const exec = jest.fn().mockResolvedValue(workspaces);
    const model = {
      find: jest.fn().mockReturnValue({ exec }),
    };
    const repository = new WorkspacesRepository(model as never);

    await expect(repository.findByUserId(userId)).resolves.toBe(workspaces);
    expect(model.find).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });
  });
});
