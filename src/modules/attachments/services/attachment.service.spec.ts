import { Types } from 'mongoose';
import { AttachmentService } from './attachment.service';

describe('AttachmentService', () => {
  let attachmentModel: any;
  let service: AttachmentService;

  beforeEach(() => {
    attachmentModel = jest.fn().mockImplementation(payload => ({
      ...payload,
      save: jest.fn().mockResolvedValue(payload),
    }));
    service = new AttachmentService(attachmentModel);
  });

  it('stores task upload storage key relative to uploads root', async () => {
    const file = {
      filename: 'stored-file.png',
      originalname: 'original.png',
      mimetype: 'image/png',
      size: 123,
      destination: 'uploads/tasks/2026/06/08',
    };

    await service.create(
      {
        workspaceId: new Types.ObjectId().toString(),
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        targetType: 'task',
        targetId: new Types.ObjectId().toString(),
      },
      file,
      new Types.ObjectId().toString(),
    );

    expect(attachmentModel).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: 'tasks/2026/06/08/stored-file.png',
        url: '/uploads/tasks/2026/06/08/stored-file.png',
      }),
    );
  });
});
