import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { ChannelsService } from '@/modules/chat/services/channels.service';
import { KanbanService } from '@/modules/kanban/services/kanban.service';
import { DocumentEntity } from '@/modules/documents/schemas/document.schema';
import { Page } from '@/modules/pages/schemas/page.schema';
import { ScrumService } from '@/modules/scrum/services/scrum.service';
import { Task } from '@/modules/tasks/schemas/task.schema';
import { WorkflowsService } from '@/modules/workflows/services/workflows.service';
import { WorkspacesRepository } from '@/modules/workspaces/repositories/workspaces.repository';
import { WorkspaceDomainEventPublisher } from '@/modules/workspaces/services/workspace-domain-event.publisher';
import { WorkspaceKeyService } from '@/modules/workspaces/services/workspace-key.service';
import { WorkspacesService } from '@/modules/workspaces/services/workspaces.service';

const mockWorkspacesRepository = () => ({
  findByUserId: jest.fn(),
  findAnyByKey: jest.fn(),
  findAnyBySlug: jest.fn(),
});

const mockCountModel = () => ({
  countDocuments: jest.fn(),
});

const mockWorkspaceKeyService = () => ({
  generateUniqueSlug: jest.fn(),
  generateUniqueKey: jest.fn(),
});

describe('WorkspacesService workspace counts', () => {
  let service: WorkspacesService;
  let repository: ReturnType<typeof mockWorkspacesRepository>;
  let taskModel: ReturnType<typeof mockCountModel>;
  let pageModel: ReturnType<typeof mockCountModel>;
  let documentModel: ReturnType<typeof mockCountModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: WorkspacesRepository, useFactory: mockWorkspacesRepository },
        { provide: WorkflowsService, useValue: {} },
        { provide: KanbanService, useValue: {} },
        { provide: ScrumService, useValue: {} },
        { provide: WorkspaceKeyService, useFactory: mockWorkspaceKeyService },
        { provide: getModelToken(Task.name), useFactory: mockCountModel },
        { provide: getModelToken(Page.name), useFactory: mockCountModel },
        {
          provide: getModelToken(DocumentEntity.name),
          useFactory: mockCountModel,
        },
        {
          provide: WorkspaceDomainEventPublisher,
          useValue: {
            publishCreated: jest.fn(),
            publishUpdated: jest.fn(),
            publishDeleted: jest.fn(),
            publishArchived: jest.fn(),
            publishRestored: jest.fn(),
          },
        },
        {
          provide: ChannelsService,
          useValue: { createWorkspaceChannel: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get(WorkspacesService);
    repository = module.get(WorkspacesRepository);
    taskModel = module.get(getModelToken(Task.name));
    pageModel = module.get(getModelToken(Page.name));
    documentModel = module.get(getModelToken(DocumentEntity.name));
  });

  it('returns user workspaces with task and docs totals', async () => {
    const workspaceId = new Types.ObjectId();
    repository.findByUserId.mockResolvedValue([
      {
        _id: workspaceId,
        name: 'Frontend',
        key: 'FE',
        type: 'scrum',
        status: 'active',
      },
    ]);
    taskModel.countDocuments.mockResolvedValue(12);
    pageModel.countDocuments.mockResolvedValue(4);
    documentModel.countDocuments.mockResolvedValue(2);

    const result = await service.findByUserId(new Types.ObjectId().toString());

    expect(result).toEqual([
      expect.objectContaining({
        _id: workspaceId,
        _count: { tasks: 12, issues: 12, docs: 6, pages: 4 },
        taskCount: 12,
        tasksCount: 12,
        docsCount: 6,
      }),
    ]);
    expect(taskModel.countDocuments).toHaveBeenCalledWith({
      workspaceId,
      isDeleted: { $ne: true },
    });
    expect(pageModel.countDocuments).toHaveBeenCalledWith({ workspaceId });
    expect(documentModel.countDocuments).toHaveBeenCalledWith({
      workspaceIds: workspaceId,
      deletedAt: null,
    });
  });
});
