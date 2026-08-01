import {
  canonicalStringify,
  createStoryContentHash,
} from './story-content-hash.util';

describe('story content hash', () => {
  it('produces the same SHA-256 hash for the same canonical snapshot', () => {
    const first = {
      content: { expectedOutcome: 'Done', problem: 'Problem' },
      requirements: [
        { requirementId: 'b', relationship: 'SUPPORTING' },
        { requirementId: 'a', relationship: 'PRIMARY' },
      ],
      decisionRecordIds: ['b', 'a'],
    };
    const second = {
      decisionRecordIds: ['a', 'b'],
      requirements: [
        { relationship: 'PRIMARY', requirementId: 'a' },
        { relationship: 'SUPPORTING', requirementId: 'b' },
      ],
      content: { problem: 'Problem', expectedOutcome: 'Done' },
    };

    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(createStoryContentHash(first)).toBe(createStoryContentHash(second));
    expect(createStoryContentHash(first)).toMatch(/^[a-f0-9]{64}$/);
  });
});
