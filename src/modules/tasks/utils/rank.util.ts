const RANK_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MIN_DIGIT = 0;
const MAX_DIGIT = RANK_ALPHABET.length - 1;
const DEFAULT_RANK = RANK_ALPHABET[Math.floor(RANK_ALPHABET.length / 2)];
const REBALANCE_STEP = 1000;
const REBALANCE_PAD_LENGTH = 10;

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

export const compareRanks = (left?: string, right?: string): number => {
  if (left && !right) return -1;
  if (!left && right) return 1;
  if (!left && !right) return 0;

  const leftRank = left!;
  const rightRank = right!;
  const maxLength = Math.max(leftRank.length, rightRank.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff =
      toDigit(leftRank, index, MIN_DIGIT) -
      toDigit(rightRank, index, MIN_DIGIT);

    if (diff !== 0) {
      return diff;
    }
  }

  return leftRank.length - rightRank.length;
};

export const generateRebalanceRank = (index: number): string => {
  return String((index + 1) * REBALANCE_STEP).padStart(
    REBALANCE_PAD_LENGTH,
    '0',
  );
};

/**
 * Generates a deterministic fractional rank between two existing ranks.
 *
 * @param beforeRank rank of the task immediately below this task, the upper bound.
 * @param afterRank rank of the task immediately above this task, the lower bound.
 */
export const generateRankBetween = (
  beforeRank?: string,
  afterRank?: string,
): string => {
  if (beforeRank && afterRank && beforeRank === afterRank) {
    throw new Error(
      `Cannot generate rank between identical ranks: "${beforeRank}"`,
    );
  }

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
