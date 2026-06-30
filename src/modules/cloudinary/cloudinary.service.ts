import { Injectable, BadRequestException } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'avatars',
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    if (!file) {
      throw new BadRequestException('Invalid file');
    }

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `sdlc-platform/${folder}`,
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Upload failed with no result'));
          resolve(result);
        },
      );

      // Chuyển buffer thành stream để upload
      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);
      stream.pipe(upload);
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    options?: {
      resourceType?: 'image' | 'video' | 'raw' | 'auto';
      publicId?: string;
      type?: 'authenticated' | 'private' | 'upload';
    },
  ): Promise<{ url: string; publicId: string; size: number }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file or missing file buffer');
    }

    const resourceType = options?.resourceType ?? 'auto';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `sdlc-platform/${folder}`,
          resource_type: resourceType,
          public_id: options?.publicId,
          type: options?.type,
        },
        (error, res) => {
          if (error) return reject(error);
          if (!res) return reject(new Error('Upload failed with no result'));
          resolve(res);
        },
      );

      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);
      stream.pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      size: result.bytes,
    };
  }

  async deleteFile(publicId: string): Promise<any> {
    if (!publicId) return;

    try {
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.destroy(
          publicId,
          { resource_type: 'raw' },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          },
        );
      });
      if (result && result.result === 'ok') {
        return result;
      }
    } catch (_error) {
      // Fallback
    }

    try {
      return await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.destroy(
          publicId,
          { resource_type: 'image' },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          },
        );
      });
    } catch (_error) {
      // Ignore errors for idempotency
    }
  }

  getPrivateDownloadUrl(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw' | 'auto' | string = 'raw',
    type: string = 'upload',
  ): string {
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: resourceType,
      type,
    });
  }
}
