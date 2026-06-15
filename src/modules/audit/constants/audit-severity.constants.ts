export const SECURITY_EVENT_SEVERITY = {
  INFO: 'INFO',
  WARN: 'WARN',
  CRITICAL: 'CRITICAL',
} as const;

export type SecurityEventSeverityLiteral =
  (typeof SECURITY_EVENT_SEVERITY)[keyof typeof SECURITY_EVENT_SEVERITY];
