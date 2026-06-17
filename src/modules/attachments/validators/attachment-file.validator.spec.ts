import { BadRequestException } from '@nestjs/common';
import { validateAttachmentFile } from './attachment-file.validator';

function file(originalname: string, mimetype: string): Express.Multer.File {
  return {
    originalname,
    mimetype,
  } as Express.Multer.File;
}

describe('validateAttachmentFile', () => {
  it('allows safe image files', () => {
    expect(() =>
      validateAttachmentFile(file('screenshot.png', 'image/png')),
    ).not.toThrow();
  });

  it('allows safe pdf files', () => {
    expect(() =>
      validateAttachmentFile(file('requirements.pdf', 'application/pdf')),
    ).not.toThrow();
  });

  it('allows mp4 video files', () => {
    expect(() =>
      validateAttachmentFile(file('demo.mp4', 'video/mp4')),
    ).not.toThrow();
  });

  it('allows common mp4 MIME variants', () => {
    expect(() =>
      validateAttachmentFile(file('demo.mp4', 'application/mp4')),
    ).not.toThrow();
    expect(() =>
      validateAttachmentFile(file('demo.mp4', 'video/x-m4v')),
    ).not.toThrow();
    expect(() =>
      validateAttachmentFile(file('demo.mp4', 'application/octet-stream')),
    ).not.toThrow();
  });

  it('blocks executable files by extension', () => {
    expect(() =>
      validateAttachmentFile(file('payload.exe', 'application/x-msdownload')),
    ).toThrow(BadRequestException);
  });

  it('blocks shell scripts by extension even with text MIME type', () => {
    expect(() =>
      validateAttachmentFile(file('deploy.sh', 'text/plain')),
    ).toThrow(BadRequestException);
  });

  it('blocks unsupported MIME type for otherwise safe extension', () => {
    expect(() =>
      validateAttachmentFile(file('report.pdf', 'application/x-msdownload')),
    ).toThrow(BadRequestException);
  });

  it('keeps generic binary MIME limited to mp4 fallback', () => {
    expect(() =>
      validateAttachmentFile(file('report.pdf', 'application/octet-stream')),
    ).toThrow(BadRequestException);
  });
});
