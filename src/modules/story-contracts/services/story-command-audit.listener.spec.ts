import { StoryCommandAuditListener } from './story-command-audit.listener';

describe('StoryCommandAuditListener', () => {
  it('persists every approved command audit through the existing audit store', () => {
    const audit = { log: jest.fn() };
    const listener = new StoryCommandAuditListener(audit as any);
    const event = {
      data: {
        workspaceId: 'workspace-1',
        aggregateId: 'contract-1',
        actorId: 'user-1',
      },
    };

    listener.created(event);
    listener.edited(event);
    listener.submitted(event);
    listener.approvalRecorded(event);
    listener.approved(event);
    listener.rejected(event);
    listener.decisionApproved(event);
    listener.superseded(event);
    listener.rebased(event);
    listener.impactResolved({
      workspaceId: 'workspace-1',
      storyContractId: 'contract-1',
      userId: 'user-1',
    });
    listener.verificationSubmitted(event);

    expect(audit.log.mock.calls.map(([entry]) => entry.type)).toEqual([
      'story.contract.created',
      'story.draft.edited',
      'story.version.submitted',
      'story.approval.recorded',
      'story.version.approved',
      'story.version.rejected',
      'decision.record.approved',
      'decision.record.superseded',
      'story.draft.rebased',
      'story.impact.resolved',
      'criterion.verification.submitted',
    ]);
    expect(audit.log).toHaveBeenCalledTimes(11);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'INFO',
        userId: 'user-1',
        metadata: expect.objectContaining({
          workspaceId: 'workspace-1',
          storyContractId: 'contract-1',
        }),
      }),
    );
  });
});
