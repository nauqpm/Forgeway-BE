import { Model, Document } from 'mongoose';

/**
 * 📌 Tạo slug chuẩn SEO, duy nhất từ title hoặc name.
 *
 * ✅ Dùng chung cho nhiều module (Post, Product, Category, ...)
 * ✅ Không nhận slug từ frontend.
 * ✅ Tự động thêm hậu tố (-1, -2, ...) nếu trùng.
 * ✅ Truy vấn Mongoose tối ưu: chỉ select `_id`.
 *
 * @param input - Chuỗi cần tạo slug (thường là title hoặc name).
 * @param model - Mongoose model tương ứng với collection cần kiểm tra.
 * @returns Slug chuẩn SEO và duy nhất.
 */
export async function generateUniqueSlug<T extends Document>(input: string, model: Model<T>): Promise<string> {
  const baseSlug = removeVietnameseTones(input);
  if (!baseSlug) throw new Error('Slug không thể rỗng');

  let slug = baseSlug;
  let count = 0;

  // ⚡ Truy vấn hiệu quả – chỉ kiểm tra tồn tại slug
  while (await model.exists({ slug }).select('_id')) {
    count++;
    slug = `${baseSlug}-${count}`;
  }

  return slug;
}

/**
 * 🧹 Chuẩn hóa chuỗi tiếng Việt thành định dạng không dấu – chuẩn SEO.
 *
 * - Loại bỏ toàn bộ dấu tiếng Việt và ký tự đặc biệt.
 * - Biến khoảng trắng thành dấu gạch nối (-).
 * - Gộp nhiều dấu gạch nối liên tiếp.
 * - Kết quả ở dạng chữ thường.
 *
 * @param str - Chuỗi đầu vào (thường là title, name).
 * @returns Chuỗi đã được chuẩn hóa và thân thiện SEO.
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';

  let normalizedStr = str.normalize('NFD');
  normalizedStr = normalizedStr.replace(/[\u0300-\u036f]/g, '');
  normalizedStr = normalizedStr.replace(/[đĐ]/g, 'd');
  normalizedStr = normalizedStr.replace(/[^a-zA-Z0-9\s-]/g, '');

  return normalizedStr
    .trim()
    .replace(/\s+/g, '-') // chuyển khoảng trắng thành dấu gạch nối
    .replace(/-+/g, '-') // gộp nhiều dấu gạch nối liên tiếp
    .toLowerCase();
}
