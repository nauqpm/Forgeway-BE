import { Types } from 'mongoose';
import { TaskAttachment } from '../schemas/task.schema';
import { TaskPriority, TaskType } from '../constants/task-status.constants';

export interface CreateTaskData {
  workspaceId: Types.ObjectId;
  key: string;
  title: string;
  description: string;
  reporterId: Types.ObjectId;
  type: TaskType;
  status: string;
  priority: TaskPriority;
  labels: string[];
  attachments: TaskAttachment[];
  sprintId?: Types.ObjectId;
  boardId?: Types.ObjectId;
  boardColumnId?: string;
  assigneeId?: Types.ObjectId;
  storyPoints?: number;
  dueDate?: Date;
  parentId?: Types.ObjectId;
  epicId?: Types.ObjectId;
}
