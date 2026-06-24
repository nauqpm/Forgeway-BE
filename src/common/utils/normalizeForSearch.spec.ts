import { normalizeForSearch } from './normalizeForSearch';

describe('normalizeForSearch', () => {
  it('normalizes Vietnamese diacritics and the đ character', () => {
    expect(normalizeForSearch('Tài liệu Đăng nhập')).toBe('tai lieu dang nhap');
  });

  it('strips HTML while preserving searchable text', () => {
    expect(normalizeForSearch('<p>Hướng dẫn sử dụng</p>')).toBe(
      'huong dan su dung',
    );
  });
});
