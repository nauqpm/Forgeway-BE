export function getAddedMentionIds(
  previousMentionIds: string[],
  nextMentionIds: string[],
): string[] {
  const previous = new Set(previousMentionIds);

  return Array.from(new Set(nextMentionIds)).filter(id => !previous.has(id));
}
