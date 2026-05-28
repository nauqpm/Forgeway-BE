import { Injectable, Logger } from '@nestjs/common';
import { IStorageProvider, UploadResult } from './storage.provider.interface';
import { promises as fs } from 'fs';
import { extname, join } from 'path';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  readonly name = 'local';
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly logger = new Logger(LocalStorageProvider.name);

  /**
   * Write the in-memory buffer to disk and return storage metadata.
   * Since the module uses memoryStorage(), we handle filename generation
   * and file writing here — not in Multer.
   */
  async upload(file: Express.Multer.File): Promise<UploadResult> {
    // Ensure upload directory exists
    await fs.mkdir(this.uploadDir, { recursive: true });

    // Generate unique filename (same logic previously in diskStorage)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const originalName = file.originalname.replace(/\.[^/.]+$/, '');
    const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeName}-${uniqueSuffix}${ext}`;

    // Write buffer to disk
    const filePath = join(this.uploadDir, filename);
    await fs.writeFile(filePath, file.buffer);

    // Attach filename to the file object so downstream code can reference it
    file.filename = filename;

    return {
      storageKey: filename,
      url: this.getUrl(filename),
    };
  }

  /**
   * Delete a file from local disk by its storage key (filename).
   */
  async delete(storageKey: string): Promise<void> {
    const filePath = join(this.uploadDir, storageKey);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      this.logger.warn(`File not found on disk: ${filePath}`);
    }
  }

  /**
   * Return the local URL path for the given storage key.
   */
  getUrl(storageKey: string): string {
    return `http://localhost:${process.env.PORT}/uploads/${storageKey}`;
  }
}
