import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import {
  ADDITIONAL_ATTACHMENT_MIME_TYPES_BY_EXTENSION,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  BLOCKED_ATTACHMENT_EXTENSIONS,
} from '../constants/attachment-file.constants';

export function validateAttachmentFile(file: Express.Multer.File): void {
  const originalName = file.originalname ?? '';
  const extension = extname(originalName).toLowerCase();
  const mimeType = (file.mimetype ?? '').toLowerCase();

  if (!extension) {
    throw new BadRequestException('Attachment must include a file extension');
  }

  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) {
    throw new BadRequestException(
      `Attachment file type ${extension} is not allowed`,
    );
  }

  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
    throw new BadRequestException(
      `Attachment file type ${extension} is not supported`,
    );
  }

  const extensionMimeTypes =
    ADDITIONAL_ATTACHMENT_MIME_TYPES_BY_EXTENSION.get(extension);

  if (
    !ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType) &&
    !extensionMimeTypes?.has(mimeType)
  ) {
    throw new BadRequestException(
      `Attachment MIME type ${mimeType || 'unknown'} is not supported`,
    );
  }
}

export function attachmentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  try {
    validateAttachmentFile(file);
    callback(null, true);
  } catch (error) {
    callback(error as Error, false);
  }
}
