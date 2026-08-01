import { createStoryContractEvent } from './story-contract.events';

describe('createStoryContractEvent', () => {
  it('creates the existing event envelope with Story aggregate context', () => {
    const event = createStoryContractEvent('story.version.approved', {
      workspaceId: 'workspace-1',
      aggregateId: 'contract-1',
      aggregateVersion: 4,
      actorId: 'user-1',
      storyVersionId: 'version-2',
    });

    expect(event).toEqual({
      type: 'story.version.approved',
      eventId: expect.any(String),
      occurredAt: expect.any(Date),
      data: {
        workspaceId: 'workspace-1',
        aggregateId: 'contract-1',
        aggregateVersion: 4,
        actorId: 'user-1',
        storyVersionId: 'version-2',
      },
    });
  });
});
