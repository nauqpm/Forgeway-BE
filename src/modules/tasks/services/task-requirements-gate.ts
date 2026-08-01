import { BadRequestException } from '@nestjs/common';
import { WorkflowsService } from '../../workflows/services/workflows.service';

export const assertTaskRequirementsGate = async (
  workflows: WorkflowsService,
  task: { requirementsState?: string; status?: string },
  workspaceId: string,
  requestedStatus?: string,
): Promise<void> => {
  if (
    requestedStatus === undefined ||
    requestedStatus === task.status ||
    !task.requirementsState ||
    task.requirementsState === 'CURRENT'
  ) {
    return;
  }

  const workflow = await workflows.findByWorkspace(workspaceId);
  const status = workflow?.statuses.find(
    candidate => candidate.id === requestedStatus,
  );
  if (status?.category === 'done' || status?.requirementsGate === 'review') {
    throw new BadRequestException({
      code:
        task.requirementsState === 'REBASE_REQUIRED'
          ? 'TASK_REQUIREMENT_REBASE_REQUIRED'
          : 'TASK_REQUIREMENT_REVIEW_REQUIRED',
      message: 'Resolve Story requirements before moving this task forward',
    });
  }
};
