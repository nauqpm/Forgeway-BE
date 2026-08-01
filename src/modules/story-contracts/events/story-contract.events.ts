import { randomUUID } from 'crypto';

export type StoryContractEventType =
  | 'story.contract.created'
  | 'story.contract.archived'
  | 'story.draft.edited'
  | 'story.draft.rebased'
  | 'story.version.submitted'
  | 'story.approval.requested'
  | 'story.approval.recorded'
  | 'story.version.approved'
  | 'story.version.rejected'
  | 'story.version.superseded'
  | 'decision.proposed'
  | 'decision.record.approved'
  | 'decision.record.superseded'
  | 'criterion.verification.submitted';

type StoryContractEventData = {
  workspaceId: string;
  aggregateId: string;
  aggregateVersion?: number;
  actorId: string;
  [key: string]: unknown;
};

export const createStoryContractEvent = <TData extends StoryContractEventData>(
  type: StoryContractEventType,
  data: TData,
) => ({
  type,
  eventId: randomUUID(),
  occurredAt: new Date(),
  data,
});
