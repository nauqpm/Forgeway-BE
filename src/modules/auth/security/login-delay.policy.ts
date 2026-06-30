export const LOGIN_DELAY_POLICY = {
  freeFailedAttempts: 5,
  backoffSeconds: [1, 2, 4, 8, 16, 30, 60],
  failureWindowMs: 15 * 60 * 1000,
} as const;

export const getLoginDelaySeconds = (failedAttempts: number): number => {
  if (failedAttempts < LOGIN_DELAY_POLICY.freeFailedAttempts) {
    return 0;
  }

  const index = Math.min(
    failedAttempts - LOGIN_DELAY_POLICY.freeFailedAttempts,
    LOGIN_DELAY_POLICY.backoffSeconds.length - 1,
  );

  return LOGIN_DELAY_POLICY.backoffSeconds[index];
};
