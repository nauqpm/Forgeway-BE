import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PagesService } from './pages.service';

describe('PagesService', () => {
  let service: PagesService;
  let pageModel: jest.Mock & {
    exists: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    pageModel = Object.assign(jest.fn(), {
      exists: jest.fn(),
      findOne: jest.fn(),
    });

    service = new PagesService(pageModel as any, {} as any, {} as any);
  });

  it('rejects creating a page when the title already exists anywhere in the workspace', async () => {
    const workspaceId = new Types.ObjectId().toString();

    pageModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    });

    await expect(
      service.create(
        {
          title: 'Roadmap',
          workspaceId,
          slug: 'roadmap',
          content: '',
          labels: [],
        },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'A document with this name already exists in this workspace',
      ),
    );

    expect(pageModel.exists).toHaveBeenCalledWith({
      workspaceId: expect.any(Types.ObjectId),
      title: { $regex: '^Roadmap$', $options: 'i' },
    });
  });

  it('rejects renaming a page to a title that already exists elsewhere in the workspace', async () => {
    const pageId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const page = {
      _id: new Types.ObjectId(pageId),
      workspaceId: new Types.ObjectId(workspaceId),
      version: 1,
      versionHistory: [],
      save: jest.fn(),
    };

    jest.spyOn(service, 'findById').mockResolvedValue(page as any);
    pageModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    });

    await expect(
      service.update(
        pageId,
        { title: 'Roadmap' },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'A document with this name already exists in this workspace',
      ),
    );

    expect(pageModel.exists).toHaveBeenCalledWith({
      workspaceId: expect.any(Types.ObjectId),
      title: { $regex: '^Roadmap$', $options: 'i' },
      _id: { $ne: expect.any(Types.ObjectId) },
    });
  });

  it('rejects sync title updates that would duplicate another page in the workspace', async () => {
    const pageId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();
    const page = {
      _id: new Types.ObjectId(pageId),
      workspaceId: new Types.ObjectId(workspaceId),
      save: jest.fn(),
    };

    jest.spyOn(service, 'findById').mockResolvedValue(page as any);
    pageModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    });

    await expect(
      service.sync(
        pageId,
        { title: 'Roadmap', content: '<p>content</p>' },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'A document with this name already exists in this workspace',
      ),
    );
  });

  it('finds a slug only inside the requested workspace', async () => {
    const workspaceId = new Types.ObjectId().toString();
    const page = { _id: new Types.ObjectId(), slug: 'roadmap', workspaceId };
    const exec = jest.fn().mockResolvedValue(page);
    const populate = jest.fn().mockReturnValue({ exec });

    pageModel.findOne.mockReturnValue({ populate });

    await expect(
      service.findBySlugInWorkspace('roadmap', workspaceId),
    ).resolves.toBe(page);

    expect(pageModel.findOne).toHaveBeenCalledWith({
      slug: 'roadmap',
      workspaceId: expect.any(Types.ObjectId),
    });
  });

  it('looks up versions by ObjectId pageId and versionId', async () => {
    const pageVersionModel = {
      findOne: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        }),
      }),
    };
    const localService = new PagesService(
      pageModel as any,
      {} as any,
      pageVersionModel as any,
    );
    const pageId = new Types.ObjectId().toString();
    const versionId = new Types.ObjectId().toString();

    await localService.getVersionById(pageId, versionId);

    expect(pageVersionModel.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(versionId),
      pageId: new Types.ObjectId(pageId),
    });
  });
});
