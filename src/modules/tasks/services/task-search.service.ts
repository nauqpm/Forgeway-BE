import { Injectable } from '@nestjs/common';
import { FilterQuery } from 'mongoose';

import { TaskDocument } from '../schemas/task.schema';
import { escapeRegex } from '../utils/regex.util';
import { normalizeSearchToken } from '../utils/search-token.util';
import { isTaskKey, normalizeTaskKey } from '../utils/task-key.util';

@Injectable()
export class TaskSearchService {
  buildSearchFilter(search?: string): FilterQuery<TaskDocument> {
    if (!search?.trim()) {
      return {};
    }

    const normalizedSearch = search.trim();

    if (isTaskKey(normalizedSearch)) {
      return {
        key: normalizeTaskKey(normalizedSearch),
      };
    }

    if (normalizedSearch.length === 1) {
      return {
        searchTokens: normalizeSearchToken(normalizedSearch),
      };
    }

    const escapedSearch = escapeRegex(normalizedSearch);

    return {
      $or: [
        {
          key: {
            $regex: escapedSearch,
            $options: 'i',
          },
        },
        {
          title: {
            $regex: escapedSearch,
            $options: 'i',
          },
        },
        {
          description: {
            $regex: escapedSearch,
            $options: 'i',
          },
        },
      ],
    };
  }
}
