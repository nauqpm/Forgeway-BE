// Service managing document file storage, including uploaded files, rendered HTML content, and deletions.
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { extname, join, resolve } from 'path';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export interface StoredUploadedFile {
  extension: string;
  filename: string;
  storagePath: string;
}

@Injectable()
export class DocumentStorageService {
  private getDynamicPath(subfolder: string = 'documents'): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return join('uploads', subfolder, String(year), month, day);
  }

  private ensureDirExists(path: string) {
    const fullPath = resolve(process.cwd(), path);

    if (!fsSync.existsSync(fullPath)) {
      fsSync.mkdirSync(fullPath, { recursive: true });
    }
  }

  ensureAllowedType(file: Express.Multer.File): string {
    const extension = extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Unsupported file type');
    }

    const buf = file.buffer;

    const startsWith = (...bytes: number[]) =>
      bytes.every((b, i) => buf[i] === b);

    const isPdf = startsWith(0x25, 0x50, 0x44, 0x46);
    const isZip = startsWith(0x50, 0x4b, 0x03, 0x04);
    const isPng = startsWith(0x89, 0x50, 0x4e, 0x47);
    const isJpeg = startsWith(0xff, 0xd8, 0xff);
    const isWebp =
      startsWith(0x52, 0x49, 0x46, 0x46) &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50;
    const isOle = startsWith(0xd0, 0xcf, 0x11, 0xe0);

    const valid =
      (extension === '.pdf' && isPdf) ||
      (['.docx', '.xlsx', '.pptx'].includes(extension) && isZip) ||
      (['.doc', '.xls', '.ppt'].includes(extension) && isOle) ||
      (extension === '.png' && isPng) ||
      (['.jpg', '.jpeg'].includes(extension) && isJpeg) ||
      (extension === '.webp' && isWebp);

    if (!valid) {
      throw new BadRequestException('Unsupported file type');
    }

    return extension;
  }

  async saveUploadedFile(
    file: Express.Multer.File,
  ): Promise<StoredUploadedFile> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds limit');
    }

    const extension = this.ensureAllowedType(file);

    const relativePath = this.getDynamicPath('documents');
    this.ensureDirExists(relativePath);

    const filename = `${randomUUID()}${extension}`;
    const storagePath = resolve(process.cwd(), relativePath, filename);

    await fs.writeFile(storagePath, file.buffer);

    return {
      extension,
      filename,
      storagePath,
    };
  }

  async saveHtmlContent(content: string): Promise<StoredUploadedFile> {
    const relativePath = this.getDynamicPath('documents');
    this.ensureDirExists(relativePath);

    const extension = '.html';
    const filename = `${randomUUID()}${extension}`;
    const storagePath = resolve(process.cwd(), relativePath, filename);

    await fs.writeFile(storagePath, content, 'utf8');

    return {
      extension,
      filename,
      storagePath,
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      await fs.unlink(storagePath);
    } catch {
      // File may have been deleted before.
      // DB soft delete is still the main source.
    }
  }
}
