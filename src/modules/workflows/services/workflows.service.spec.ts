import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService requirements gate', () => {
  const createModel = () =>
    Object.assign(
      jest.fn().mockImplementation(value => ({
        ...value,
        save: jest.fn().mockResolvedValue(value),
      })),
      { findOne: jest.fn().mockResolvedValue(null) },
    );

  it('rejects two statuses marked as the requirements review gate', async () => {
    const workflowModel = createModel();
    const service = new WorkflowsService(workflowModel as any);

    await expect(
      service.create({
        workspaceId: '507f1f77bcf86cd799439011',
        name: 'Delivery',
        defaultStatus: 'todo',
        statuses: [
          { id: 'review-a', name: 'Review A', requirementsGate: 'review' },
          { id: 'review-b', name: 'Review B', requirementsGate: 'review' },
        ],
      }),
    ).rejects.toThrow(
      'Only one workflow status may be the requirements review gate',
    );
  });

  it('rejects an update that adds two requirements review gates', async () => {
    const workflowModel = createModel();
    const service = new WorkflowsService(workflowModel as any);
    jest.spyOn(service, 'findById').mockResolvedValue({
      statuses: [],
      save: jest.fn(),
    } as any);

    await expect(
      service.update('507f1f77bcf86cd799439012', {
        statuses: [
          { id: 'review-a', name: 'Review A', requirementsGate: 'review' },
          { id: 'review-b', name: 'Review B', requirementsGate: 'review' },
        ],
      }),
    ).rejects.toThrow(
      'Only one workflow status may be the requirements review gate',
    );
  });

  it('seeds exactly one requirements review gate in the default workflow', async () => {
    const workflowModel = createModel();
    const service = new WorkflowsService(workflowModel as any);

    await service.createDefaultWorkflow('507f1f77bcf86cd799439011');

    const statuses = workflowModel.mock.calls[0][0].statuses;
    expect(
      statuses.filter(
        (status: { requirementsGate?: string }) =>
          status.requirementsGate === 'review',
      ),
    ).toHaveLength(1);
  });

  it('scopes a workflow read by both workflow and Workspace IDs', async () => {
    const workflowModel = createModel();
    workflowModel.findOne.mockResolvedValue(null);
    const service = new WorkflowsService(workflowModel as any);
    const workflowId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();

    await expect(service.findById(workflowId, workspaceId)).rejects.toEqual(
      new NotFoundException(`Workflow ${workflowId} not found`),
    );
    expect(workflowModel.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
    });
  });

  it('does not update a workflow through a different Workspace', async () => {
    const workflowModel = createModel();
    workflowModel.findOne.mockResolvedValue(null);
    const service = new WorkflowsService(workflowModel as any);
    const workflowId = new Types.ObjectId().toString();
    const workspaceId = new Types.ObjectId().toString();

    await expect(
      service.update(workflowId, { name: 'Restricted' }, workspaceId),
    ).rejects.toEqual(
      new NotFoundException(`Workflow ${workflowId} not found`),
    );
    expect(workflowModel.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
    });
  });
});
