import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { STORY_AUDIT_EVENTS } from '../../audit/constants/story-audit-events.constants';
import { AuditLogService } from '../../audit/services/audit-log.service';

type StoryEvent = {
  data?: {
    workspaceId?: string;
    aggregateId?: string;
    actorId?: string;
    [key: string]: unknown;
  };
  workspaceId?: string;
  storyContractId?: string;
  taskId?: string;
  actorId?: string;
  userId?: string;
  [key: string]: unknown;
};

@Injectable()
export class StoryCommandAuditListener {
  constructor(private readonly audit: AuditLogService) {}

  @OnEvent('story.contract.created')
  created(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_CONTRACT_CREATED, event);
  }

  @OnEvent('story.draft.edited')
  edited(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_DRAFT_EDITED, event);
  }

  @OnEvent('story.version.submitted')
  submitted(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_VERSION_SUBMITTED, event);
  }

  @OnEvent('story.approval.recorded')
  approvalRecorded(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_APPROVAL_RECORDED, event);
  }

  @OnEvent('story.version.approved')
  approved(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_VERSION_APPROVED, event);
  }

  @OnEvent('story.version.rejected')
  rejected(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_VERSION_REJECTED, event);
  }

  @OnEvent('decision.record.approved')
  decisionApproved(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_DECISION_APPROVED, event);
  }

  @OnEvent('decision.record.superseded')
  superseded(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_DECISION_SUPERSEDED, event);
  }

  @OnEvent('story.draft.rebased')
  rebased(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_DRAFT_REBASED, event);
  }

  @OnEvent('task.story.rebased')
  impactResolved(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_IMPACT_RESOLVED, event);
  }

  @OnEvent('criterion.verification.submitted')
  verificationSubmitted(event: StoryEvent) {
    this.record(STORY_AUDIT_EVENTS.STORY_VERIFICATION_SUBMITTED, event);
  }

  private record(
    type: (typeof STORY_AUDIT_EVENTS)[keyof typeof STORY_AUDIT_EVENTS],
    event: StoryEvent,
  ) {
    const data = event.data ?? event;
    this.audit.log({
      type,
      severity: 'INFO',
      userId: String(data.actorId ?? data.userId ?? ''),
      metadata: {
        ...data,
        workspaceId: data.workspaceId,
        storyContractId: data.aggregateId ?? data.storyContractId,
      },
    });
  }
}
