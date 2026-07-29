import { parseChannelOrganizationScopeEnabled } from './env.validation';

describe('CHANNEL_ORGANIZATION_SCOPE_ENABLED', () => {
  it('defaults to false when unset', () => {
    expect(parseChannelOrganizationScopeEnabled(undefined)).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses %s', (value, expected) => {
    expect(parseChannelOrganizationScopeEnabled(value)).toBe(expected);
  });
});
