import { ConflictException, Injectable } from '@nestjs/common';

import { removeVietnameseTones } from '../../../common/utils/slug.utils';
import { WorkspacesRepository } from '../repositories/workspaces.repository';

@Injectable()
export class WorkspaceKeyService {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = removeVietnameseTones(name).substring(0, 50);
    let slug = baseSlug;
    let counter = 1;

    while (await this.workspacesRepository.findAnyBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  async generateUniqueKey(
    source: string,
    currentWorkspaceId?: string,
  ): Promise<string> {
    const baseKey =
      source
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 10) || 'SPACE';

    let key = baseKey;
    let counter = 1;

    while (true) {
      const existing = await this.workspacesRepository.findAnyByKey(key);
      if (!existing || existing._id.toString() === currentWorkspaceId) {
        return key;
      }

      const suffix = counter.toString();
      key = `${baseKey.substring(0, Math.max(1, 10 - suffix.length))}${suffix}`;
      counter += 1;

      if (counter > 999) {
        throw new ConflictException('Unable to generate unique workspace key');
      }
    }
  }
}