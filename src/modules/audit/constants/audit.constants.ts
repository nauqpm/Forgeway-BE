import { AUTH_AUDIT_EVENTS } from './auth-audit-events.constants';
import { TASK_AUDIT_EVENTS } from './task-audit-events.constants';

export const SECURITY_EVENT_TYPES = {
  ...AUTH_AUDIT_EVENTS,
  ...TASK_AUDIT_EVENTS,
} as const;

export type SecurityEventTypeLiteral =
  (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES];

export { AUTH_AUDIT_EVENTS } from './auth-audit-events.constants';
export { TASK_AUDIT_EVENTS } from './task-audit-events.constants';
export { SECURITY_EVENT_SEVERITY } from './audit-severity.constants';
export type { AuthAuditEventLiteral } from './auth-audit-events.constants';
export type { TaskAuditEventLiteral } from './task-audit-events.constants';
export type { SecurityEventSeverityLiteral } from './audit-severity.constants';
