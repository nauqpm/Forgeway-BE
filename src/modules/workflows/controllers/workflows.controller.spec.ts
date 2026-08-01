import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkflowsController } from './workflows.controller';

describe('WorkflowsController workspace authorization', () => {
  const prototype = WorkflowsController.prototype;

  it('uses JWT and Workspace role guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, WorkflowsController)).toEqual([
      JwtAuthGuard,
      WorkspaceRoleGuard,
    ]);
  });

  it.each([
    'findAll',
    'findOne',
    'findByWorkspace',
    'getNextStatuses',
  ] as const)('%s requires a Workspace read permission', method => {
    expect(
      Reflect.getMetadata(
        REQUIRED_WORKSPACE_PERMISSIONS_KEY,
        prototype[method],
      ),
    ).toEqual([WORKSPACE_PERMISSIONS.STORY_READ]);
  });

  it.each(['create', 'update', 'delete', 'createDefault'] as const)(
    '%s requires Workspace admin authority',
    method => {
      expect(
        Reflect.getMetadata(
          REQUIRED_WORKSPACE_PERMISSIONS_KEY,
          prototype[method],
        ),
      ).toEqual([WORKSPACE_PERMISSIONS.WORKSPACE_UPDATE]);
    },
  );

  it('passes Workspace scope through workflow-id reads and writes', async () => {
    const workflowsService = {
      findById: jest.fn().mockResolvedValue({ _id: 'workflow-1' }),
      update: jest.fn().mockResolvedValue({ _id: 'workflow-1' }),
      delete: jest.fn().mockResolvedValue(undefined),
      getNextStatuses: jest.fn().mockResolvedValue([]),
    };
    const controller = new WorkflowsController(workflowsService as any);

    await controller.findOne('workflow-1', 'workspace-1');
    await controller.update('workflow-1', {}, 'workspace-1');
    await controller.delete('workflow-1', 'workspace-1');
    await controller.getNextStatuses('workflow-1', 'inprogress', 'workspace-1');

    expect(workflowsService.findById).toHaveBeenCalledWith(
      'workflow-1',
      'workspace-1',
    );
    expect(workflowsService.update).toHaveBeenCalledWith(
      'workflow-1',
      {},
      'workspace-1',
    );
    expect(workflowsService.delete).toHaveBeenCalledWith(
      'workflow-1',
      'workspace-1',
    );
    expect(workflowsService.getNextStatuses).toHaveBeenCalledWith(
      'workflow-1',
      'inprogress',
      'workspace-1',
    );
  });
});
