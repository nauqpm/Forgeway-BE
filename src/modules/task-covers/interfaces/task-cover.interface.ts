import {
  TaskCoverSource,
  TaskCoverType,
} from '../constants/task-cover.constants';

export interface TaskCover {
  type: TaskCoverType;
  color?: string;
  imageUrl?: string;
  source?: TaskCoverSource;
  updatedBy?: string;
  updatedAt?: Date;
}
