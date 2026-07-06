import { Injectable } from '@nestjs/common';
import { WorkLogDocument } from '../schemas/work-log.schema';
import { WorkLogDto } from '../dtos/responses/work-log.dto';

@Injectable()
export class WorkLogMapper {
  mapToDto(workLog: WorkLogDocument | any): WorkLogDto {
    if (!workLog) {
      return workLog;
    }

    const plain =
      typeof workLog.toObject === 'function' ? workLog.toObject() : workLog;

    return {
      id: this.toId(plain._id || plain.id),
      workspaceId: this.toId(plain.workspaceId),
      taskId: this.toId(plain.taskId),
      taskKey: plain.taskKey,
      loggedBy: this.toId(plain.loggedBy),
      hoursSpent: plain.hoursSpent,
      description: plain.description,
      loggedAt: plain.loggedAt,
      createdAt: plain.createdAt,
    };
  }

  mapToDtos(workLogs: Array<WorkLogDocument | any>): WorkLogDto[] {
    return workLogs.map(wl => this.mapToDto(wl));
  }

  private toId(value: any): string {
    if (!value) return '';
    if (value._id) return value._id.toString();
    return value.toString();
  }
}
