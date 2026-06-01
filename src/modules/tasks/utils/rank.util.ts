const RANK_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MIN_DIGIT = 0;
const MAX_DIGIT = RANK_ALPHABET.length - 1;
const DEFAULT_RANK = RANK_ALPHABET[Math.floor(RANK_ALPHABET.length / 2)];

const toDigit = (rank: string, index: number, fallback: number): number => {
  if (index >= rank.length) {
    return fallback;
  }

  const digit = RANK_ALPHABET.indexOf(rank[index]);
  if (digit === -1) {
    throw new Error(`Invalid rank character: ${rank[index]}`);
  }

  return digit;
};

/**
 * Generates a deterministic fractional rank.
 *
 * beforeRank is the rank of the next task below this task.
 * afterRank is the rank of the previous task above this task.
 */
export const generateRankBetween = (
  beforeRank?: string,
  afterRank?: string,
): string => {
  if (!beforeRank && !afterRank) {
    return DEFAULT_RANK;
  }

  const lowerRank = afterRank ?? '';
  const upperRank = beforeRank ?? '';
  let prefix = '';
  let index = 0;

  while (true) {
    const lowerDigit = afterRank
      ? toDigit(lowerRank, index, MIN_DIGIT)
      : MIN_DIGIT;
    const upperDigit = beforeRank
      ? toDigit(upperRank, index, MAX_DIGIT)
      : MAX_DIGIT;

    if (upperDigit - lowerDigit > 1) {
      const middleDigit = Math.floor((lowerDigit + upperDigit) / 2);
      return `${prefix}${RANK_ALPHABET[middleDigit]}`;
    }

    prefix += RANK_ALPHABET[lowerDigit];
    index += 1;
  }
};
