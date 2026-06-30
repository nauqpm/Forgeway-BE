import { getLoginDelaySeconds, LOGIN_DELAY_POLICY } from './login-delay.policy';

describe('login delay policy', () => {
  it.each([1, 2, 3, 4])('does not delay failed attempt %i', failedAttempts => {
    expect(getLoginDelaySeconds(failedAttempts)).toBe(0);
  });

  it.each([
    [5, 1],
    [6, 2],
    [7, 4],
    [8, 8],
    [9, 16],
    [10, 30],
    [11, 60],
    [100, 60],
  ])('maps failed attempt %i to %i seconds', (attempts, expected) => {
    expect(getLoginDelaySeconds(attempts)).toBe(expected);
  });

  it('uses a fifteen-minute failure window', () => {
    expect(LOGIN_DELAY_POLICY.failureWindowMs).toBe(15 * 60 * 1000);
  });
});
