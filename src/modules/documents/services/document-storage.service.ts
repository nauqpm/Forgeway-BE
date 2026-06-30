// Service managing document file storage, including uploaded files, rendered HTML content, and deletions.
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname } from 'path';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';
import {
  slugifyFilename,
  generateShortHash,
  decodeFilename,
} from '../../cloudinary/cloudinary.utils';

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
  cloudinaryPublicId?: string;
}

@Injectable()
export class DocumentStorageService {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

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
    workspaceId?: string,
  ): Promise<StoredUploadedFile> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    file.originalname = decodeFilename(file.originalname);

    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds limit');
    }

    const extension = this.ensureAllowedType(file);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension);

    const folder = workspaceId
      ? `workspaces/${workspaceId}/documents`
      : 'documents';
    const cleanName = slugifyFilename(file.originalname);
    const hash = generateShortHash(4);
    const publicId = isImage
      ? `${cleanName}_${hash}`
      : `${cleanName}_${hash}${extension}`;

    const result = await this.cloudinaryService.uploadFile(file, folder, {
      resourceType: isImage ? 'image' : 'raw',
      publicId,
    });

    return {
      extension,
      filename: result.publicId.split('/').pop() || '',
      storagePath: result.url,
      cloudinaryPublicId: result.publicId,
    };
  }

  async saveHtmlContent(
    content: string,
    workspaceId?: string,
    originalName?: string,
  ): Promise<StoredUploadedFile> {
    const extension = '.html';
    const cleanName = originalName
      ? slugifyFilename(originalName)
      : `doc_${randomUUID()}`;
    const hash = generateShortHash(4);
    const publicId = `${cleanName}_${hash}${extension}`;

    const filename = `${publicId}`;

    const multerFile = {
      buffer: Buffer.from(content, 'utf8'),
      originalname: filename,
      mimetype: 'text/html',
      size: Buffer.byteLength(content, 'utf8'),
    } as Express.Multer.File;

    const folder = workspaceId
      ? `workspaces/${workspaceId}/documents`
      : 'documents';

    const result = await this.cloudinaryService.uploadFile(multerFile, folder, {
      resourceType: 'raw',
      publicId,
      type: 'authenticated',
    });

    return {
      extension,
      filename: result.publicId.split('/').pop() || '',
      storagePath: result.url,
      cloudinaryPublicId: result.publicId,
    };
  }

  async deleteFile(publicId?: string, localPath?: string): Promise<void> {
    if (publicId) {
      await this.cloudinaryService.deleteFile(publicId);
    } else if (localPath) {
      try {
        await fs.unlink(localPath);
      } catch {
        // File may have been deleted before.
      }
    }
  }

  getPrivateUrl(
    publicId: string,
    resourceType: string = 'raw',
    type: string = 'upload',
  ): string {
    return this.cloudinaryService.getPrivateDownloadUrl(
      publicId,
      resourceType,
      type,
    );
  }
}
