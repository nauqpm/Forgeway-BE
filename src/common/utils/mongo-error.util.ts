export const isMongoUnavailable = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return [
    'MongoServerSelectionError',
    'MongoNetworkTimeoutError',
    'MongoNetworkError',
  ].includes(error.name);
};
