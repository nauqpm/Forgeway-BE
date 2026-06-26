import { Types } from 'mongoose';
import { AttachmentService } from './attachment.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';

describe('AttachmentService', () => {
  let attachmentModel: any;
  let cloudinaryService: jest.Mocked<CloudinaryService>;
  let service: AttachmentService;

  beforeEach(() => {
    attachmentModel = jest.fn().mockImplementation(payload => ({
      ...payload,
      save: jest.fn().mockResolvedValue(payload),
    }));
    cloudinaryService = {
      uploadFile: jest.fn().mockResolvedValue({
        publicId: 'test-public-id',
        url: 'https://res.cloudinary.com/test-url',
      }),
    } as unknown as jest.Mocked<CloudinaryService>;

    const workspacesService = {
      findById: jest.fn().mockResolvedValue({ name: 'Test Workspace' }),
    } as any;

    const taskModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ title: 'Test Task' }),
      }),
    } as any;

    const pageModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ title: 'Test Page' }),
      }),
    } as any;

    const channelModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ name: 'Test Channel' }),
      }),
    } as any;

    service = new AttachmentService(
      attachmentModel,
      taskModel,
      pageModel,
      channelModel,
      cloudinaryService,
      workspacesService,
    );
  });

  it('uploads file to Cloudinary and saves attachment with publicId and url', async () => {
    const file = {
      filename: 'stored-file.png',
      originalname: 'original.png',
      mimetype: 'image/png',
      size: 123,
      buffer: Buffer.from(''),
    } as Express.Multer.File;

    const workspaceId = new Types.ObjectId().toString();
    const targetId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    await service.create(
      {
        workspaceId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        targetType: 'task',
        targetId,
      },
      file,
      userId,
    );

    const expectedFolder = `workspaces/test-workspace_${workspaceId}/tasks/test-task_${targetId}`;

    expect(cloudinaryService.uploadFile).toHaveBeenCalledWith(
      file,
      expectedFolder,
      expect.any(Object),
    );

    expect(attachmentModel).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: new Types.ObjectId(workspaceId),
        uploadedBy: new Types.ObjectId(userId),
        filename: file.filename || file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey: 'test-public-id',
        url: 'https://res.cloudinary.com/test-url',
        cloudinaryPublicId: 'test-public-id',
        targetType: 'task',
        targetId,
        downloadCount: 0,
        isDeleted: false,
      }),
    );
  });
});
