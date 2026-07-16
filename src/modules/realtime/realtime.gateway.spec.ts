import { Types } from 'mongoose';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway page authorization', () => {
  it('maps a workspace owner to workspace_admin for page editing', async () => {
    const ownerId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();
    const pagesService = {
      findById: jest.fn().mockResolvedValue({ workspaceId }),
    };
    const workspaceModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ownerId, members: [] }),
      }),
    };
    const gateway = new RealtimeGateway(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      pagesService as any,
      workspaceModel as any,
    );

    await expect(
      (gateway as any).authorizePageEdit(
        ownerId.toString(),
        new Types.ObjectId().toString(),
      ),
    ).resolves.toBe(true);
  });
});
