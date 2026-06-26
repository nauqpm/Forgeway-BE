import { extname } from 'path';

/**
 * Decodes filename from latin1 (default Multer parsing) to utf8.
 */
export function decodeFilename(filename: string): string {
  if (!filename) return '';
  try {
    return Buffer.from(filename, 'latin1').toString('utf8');
  } catch {
    return filename;
  }
}

/**
 * Converts a string to a clean URL slug (ASCII, lowercase, underscores).
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '')
    .replace(/^_+|_+$/g, '');
}

/**
 * Removes Vietnamese accents and special characters, converting to a clean slug.
 */
export function slugifyFilename(filename: string): string {
  const decoded = decodeFilename(filename);
  const ext = extname(decoded);
  const nameWithoutExt = decoded.substring(0, decoded.length - ext.length);
  const slug = slugify(nameWithoutExt);
  return slug || 'file';
}

/**
 * Generates a short random hash.
 */
export function generateShortHash(length: number = 4): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Generates date path YYYY-MM-DD
 */
export function getDatePath(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
