export interface ColumnNameCandidate {
  id: string;
  name: string;
}

export const normalizeColumnDisplayName = (name: string): string =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ');

export const getColumnNameKey = (name: string): string =>
  normalizeColumnDisplayName(name).toLocaleLowerCase('en-US');

export const isColumnNameEmpty = (name: string): boolean =>
  normalizeColumnDisplayName(name).length === 0;

export const hasDuplicateColumnName = (
  columns: readonly ColumnNameCandidate[],
  candidateName: string,
  excludedColumnId?: string,
): boolean => {
  const candidateKey = getColumnNameKey(candidateName);

  return columns.some(
    column =>
      column.id !== excludedColumnId &&
      getColumnNameKey(column.name) === candidateKey,
  );
};
