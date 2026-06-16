import { isAbsolute, join, relative, resolve, sep } from 'path';

export function getUploadDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
}

export function getUploadPath(...segments: string[]): string {
  return join(getUploadDir(), ...segments);
}

export function getStorageKeyFromDestination(
  destination: string | undefined,
  filename: string,
): string {
  if (!destination) {
    return `others/${filename}`;
  }

  const uploadDir = getUploadDir();
  const relativeToUploadDir = relative(uploadDir, resolve(destination));
  const isInsideUploadDir =
    relativeToUploadDir === '' ||
    (!relativeToUploadDir.startsWith('..') &&
      !relativeToUploadDir.startsWith(`..${sep}`) &&
      !isAbsolute(relativeToUploadDir));

  const storageDir = isInsideUploadDir
    ? relativeToUploadDir || '.'
    : destination.replace(/\\/g, '/').replace(/^\/?uploads\/?/, '');

  return `${storageDir}/${filename}`
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}