export interface UploadResult {
  storageKey: string;
  url: string;
}

export interface IStorageProvider {
  readonly name: string;

  /**
   * Persist a file to storage and return its key + public URL.
   * With memoryStorage, the file buffer is in file.buffer.
   */
  upload(file: Express.Multer.File): Promise<UploadResult>;

  /**
   * Delete a file from the storage backend by its storage key.
   */
  delete(storageKey: string): Promise<void>;

  /**
   * Get the public URL for a given storage key.
   */
  getUrl(storageKey: string): string;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
