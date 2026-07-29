import { Types } from 'mongoose';
import { computeDmParticipantKey } from './dm-participant-key.util';

describe('computeDmParticipantKey', () => {
  const firstUser = new Types.ObjectId();
  const secondUser = new Types.ObjectId();

  it('returns the same key regardless of argument order', () => {
    expect(computeDmParticipantKey(firstUser, secondUser)).toBe(
      computeDmParticipantKey(secondUser, firstUser),
    );
  });

  it('returns different keys for different pairs', () => {
    expect(computeDmParticipantKey(firstUser, secondUser)).not.toBe(
      computeDmParticipantKey(firstUser, new Types.ObjectId()),
    );
  });

  it('rejects a same-user pair', () => {
    expect(() => computeDmParticipantKey(firstUser, firstUser)).toThrow(
      'DM participants must be different users',
    );
  });
});
