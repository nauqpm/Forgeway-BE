import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workflow, WorkflowDocument } from '../schemas/workflow.schema';
import {
  CreateWorkflowDto,
  WorkflowTransitionDto,
} from '../dtos/create-workflow.dto';
import { UpdateWorkflowDto } from '../dtos/update-workflow.dto';

@Injectable()
export class WorkflowsService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dropLegacyProjectIndex();
  }

  async create(
    dto: CreateWorkflowDto & { workspaceId: string },
  ): Promise<WorkflowDocument> {
    const existingWorkflow = await this.findByWorkspace(dto.workspaceId);
    if (existingWorkflow) {
      throw new ConflictException('Workflow already exists for this Workspace');
    }

    const statusesWithDefaults = dto.statuses.map(status => ({
      ...status,
      color: status.color || '#6b7280',
    }));

    const workflow = new this.workflowModel({
      workspaceId: new Types.ObjectId(dto.workspaceId),
      name: dto.name,
      defaultStatus: dto.defaultStatus,
      statuses: statusesWithDefaults,
      transitions: dto.transitions || [],
    });

    const saved = await workflow.save();
    this.logger.log(
      `Created workflow ${saved._id} for Workspace ${dto.workspaceId}`,
    );
    return saved;
  }

  async findByWorkspace(workspaceId: string): Promise<WorkflowDocument | null> {
    return this.workflowModel.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
    });
  }

  async findById(id: string): Promise<WorkflowDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid workflow ID');
    }
    const workflow = await this.workflowModel.findById(id);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto): Promise<WorkflowDocument> {
    const workflow = await this.findById(id);
    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.defaultStatus !== undefined)
      workflow.defaultStatus = dto.defaultStatus;
    if (dto.statuses !== undefined) {
      workflow.statuses = dto.statuses.map(status => ({
        ...status,
        color: status.color || '#6b7280',
      })) as any;
    }
    if (dto.transitions !== undefined) workflow.transitions = dto.transitions;

    const updated = await (workflow as any).save();
    this.logger.log(`Updated workflow ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.workflowModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    this.logger.log(`Deleted workflow ${id}`);
  }

  async canTransition(
    workflowId: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<boolean> {
    const workflow = await this.findById(workflowId);
    const transition = workflow.transitions.find(
      (t: WorkflowTransitionDto) =>
        t.fromStatus === fromStatus && t.toStatus === toStatus,
    );
    return !!transition;
  }

  async getNextStatuses(
    workflowId: string,
    currentStatus: string,
  ): Promise<WorkflowTransitionDto[]> {
    const workflow = await this.findById(workflowId);
    return workflow.transitions.filter(
      (t: WorkflowTransitionDto) => t.fromStatus === currentStatus,
    );
  }

  async createDefaultWorkflow(workspaceId: string): Promise<WorkflowDocument> {
    const existingWorkflow = await this.findByWorkspace(workspaceId);
    if (existingWorkflow) {
      throw new ConflictException('Workflow already exists for this Workspace');
    }

    const defaultStatuses = [
      { id: 'todo', name: 'To Do', color: '#6b7280', category: 'todo' },
      {
        id: 'inprogress',
        name: 'In Progress',
        color: '#f59e0b',
        category: 'inprogress',
      },
      {
        id: 'review',
        name: 'In Review',
        color: '#8b5cf6',
        category: 'inprogress',
      },
      { id: 'done', name: 'Done', color: '#10b981', category: 'done' },
    ];

    const defaultTransitions: WorkflowTransitionDto[] = [
      { fromStatus: 'todo', toStatus: 'inprogress', name: 'Start Working' },
      {
        fromStatus: 'inprogress',
        toStatus: 'review',
        name: 'Submit for Review',
      },
      {
        fromStatus: 'inprogress',
        toStatus: 'todo',
        name: 'Move Back to To Do',
      },
      { fromStatus: 'review', toStatus: 'inprogress', name: 'Request Changes' },
      { fromStatus: 'review', toStatus: 'done', name: 'Approve' },
      { fromStatus: 'done', toStatus: 'inprogress', name: 'Reopen' },
    ];

    const workflow = new this.workflowModel({
      workspaceId: new Types.ObjectId(workspaceId),
      name: 'Default Workflow',
      defaultStatus: 'todo',
      statuses: defaultStatuses,
      transitions: defaultTransitions,
    });

    const saved = await workflow.save();
    this.logger.log(
      `Created default workflow ${saved._id} for Workspace ${workspaceId}`,
    );
    return saved;
  }

  private async dropLegacyProjectIndex(): Promise<void> {
    try {
      const collection = this.workflowModel.collection;
      const indexExists = await collection.indexExists('projectId_1');

      if (indexExists) {
        await collection.dropIndex('projectId_1');
        this.logger.warn(
          'Dropped legacy workflows.projectId_1 index; workflows now use workspaceId',
        );
      }
    } catch (error) {
      this.logger.warn(
        'Could not drop legacy workflows.projectId_1 index automatically',
        error,
      );
    }
  }
}
