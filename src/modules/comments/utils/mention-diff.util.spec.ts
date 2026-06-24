import { getAddedMentionIds } from './mention-diff.util';

describe('getAddedMentionIds', () => {
  it('returns mentions added during an update', () => {
    expect(getAddedMentionIds(['user-a'], ['user-a', 'user-b'])).toEqual([
      'user-b',
    ]);
  });

  it('does not return existing mentions', () => {
    expect(getAddedMentionIds(['user-a'], ['user-a'])).toEqual([]);
  });

  it('does not treat removed mentions as added', () => {
    expect(getAddedMentionIds(['user-a', 'user-b'], ['user-a'])).toEqual([]);
  });

  it('deduplicates newly added mentions', () => {
    expect(
      getAddedMentionIds(['user-a'], ['user-a', 'user-b', 'user-b']),
    ).toEqual(['user-b']);
  });
});
