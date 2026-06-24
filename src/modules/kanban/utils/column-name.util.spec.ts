import {
  getColumnNameKey,
  hasDuplicateColumnName,
  isColumnNameEmpty,
  normalizeColumnDisplayName,
} from './column-name.util';

describe('column name utilities', () => {
  describe('normalizeColumnDisplayName', () => {
    it('normalizes Unicode and collapses surrounding and repeated whitespace', () => {
      expect(normalizeColumnDisplayName('  Ｉｎ   Progress  ')).toBe(
        'In Progress',
      );
    });

    it('preserves display casing', () => {
      expect(normalizeColumnDisplayName('  Code REVIEW  ')).toBe('Code REVIEW');
    });
  });

  describe('getColumnNameKey', () => {
    it('creates a case-insensitive comparison key', () => {
      expect(getColumnNameKey('  In   Progress ')).toBe('in progress');
    });
  });

  describe('isColumnNameEmpty', () => {
    it('detects names that are empty after normalization', () => {
      expect(isColumnNameEmpty(' \t\n ')).toBe(true);
    });
  });

  describe('hasDuplicateColumnName', () => {
    const columns = [
      { id: 'todo', name: 'To Do' },
      { id: 'progress', name: 'In Progress' },
    ];

    it('detects duplicates regardless of casing and whitespace', () => {
      expect(hasDuplicateColumnName(columns, '  in   PROGRESS ')).toBe(true);
    });

    it('allows a column to keep its own normalized name during rename', () => {
      expect(hasDuplicateColumnName(columns, ' in progress ', 'progress')).toBe(
        false,
      );
    });

    it('does not report a unique name as duplicate', () => {
      expect(hasDuplicateColumnName(columns, 'Done')).toBe(false);
    });
  });
});
