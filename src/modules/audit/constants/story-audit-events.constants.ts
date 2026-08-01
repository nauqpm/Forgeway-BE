export const STORY_AUDIT_EVENTS = {
  STORY_CONTRACT_CREATED: 'story.contract.created',
  STORY_DRAFT_EDITED: 'story.draft.edited',
  STORY_VERSION_SUBMITTED: 'story.version.submitted',
  STORY_APPROVAL_RECORDED: 'story.approval.recorded',
  STORY_VERSION_APPROVED: 'story.version.approved',
  STORY_VERSION_REJECTED: 'story.version.rejected',
  STORY_DECISION_APPROVED: 'decision.record.approved',
  STORY_DECISION_SUPERSEDED: 'decision.record.superseded',
  STORY_DRAFT_REBASED: 'story.draft.rebased',
  STORY_IMPACT_RESOLVED: 'story.impact.resolved',
  STORY_VERIFICATION_SUBMITTED: 'criterion.verification.submitted',
} as const;

export type StoryAuditEventLiteral =
  (typeof STORY_AUDIT_EVENTS)[keyof typeof STORY_AUDIT_EVENTS];
