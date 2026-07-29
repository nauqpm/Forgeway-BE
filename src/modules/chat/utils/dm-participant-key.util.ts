import { Types } from 'mongoose';

export function computeDmParticipantKey(
  firstUserId: Types.ObjectId,
  secondUserId: Types.ObjectId,
): string {
  const participantIds = [
    firstUserId.toHexString(),
    secondUserId.toHexString(),
  ];

  if (participantIds[0] === participantIds[1]) {
    throw new Error('DM participants must be different users');
  }

  return participantIds.sort().join(':');
}
