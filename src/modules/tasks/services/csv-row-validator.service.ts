import { Injectable } from '@nestjs/common';
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from '../constants/task-status.constants';
import { CreateTaskDto } from '../dtos/requests/create-task.dto';
import { CsvRowResultDto } from '../dtos/requests/import-csv-preview.dto';
import { ImportLookupMaps } from './csv-import-lookup.service';
import {
  getField,
  lookupWithWarning,
  parseDateField,
  parseNumericField,
} from '../utils/csv-import.helpers';

@Injectable()
export class CsvRowValidatorService {
  validateRow(
    record: Record<string, string>,
    rowIndex: number,
    maps: ImportLookupMaps,
  ): CsvRowResultDto {
    const errors: string[] = [];
    const warnings: string[] = [];

    const title = getField(record, 'Title', 'title');
    if (!title) {
      errors.push('Tiêu đề (title) không được để trống.');
    } else if (title.length > 255) {
      errors.push('Tiêu đề (title) vượt quá 255 ký tự.');
    }

    const description = getField(record, 'Description', 'description');
    if (description.length > 5000) {
      errors.push('Mô tả (description) vượt quá 5000 ký tự.');
    }

    const type = getField(record, 'Type', 'type') || 'task';
    if (!TASK_TYPES.includes(type.toLowerCase() as any)) {
      errors.push(
        `Loại task (type) không hợp lệ. Phải là: ${TASK_TYPES.join(', ')}.`,
      );
    }

    const priority = getField(record, 'Priority', 'priority') || 'medium';
    if (!TASK_PRIORITIES.includes(priority.toLowerCase() as any)) {
      errors.push(
        `Độ ưu tiên (priority) không hợp lệ. Phải là: ${TASK_PRIORITIES.join(', ')}.`,
      );
    }

    const status = getField(record, 'Status', 'status') || 'todo';

    const assigneeEmailRaw = getField(record, 'Assignee Email', 'assigneeEmail');
    const assigneeLookup = lookupWithWarning(
      assigneeEmailRaw,
      maps.userEmailMap,
      `Email '${assigneeEmailRaw}' không thuộc workspace. Assignee sẽ được để trống.`,
    );
    if (assigneeLookup.warning) warnings.push(assigneeLookup.warning);

    const spRaw = getField(record, 'Story Points', 'storyPoints');
    const spResult = parseNumericField(
      spRaw,
      { min: 0, max: 100 },
      'Story points phải là số hợp lệ từ 0 đến 100.',
    );
    if (spResult.error) errors.push(spResult.error);

    const startRaw = getField(record, 'Start Date', 'startDate');
    const startResult = parseDateField(
      startRaw,
      'Ngày bắt đầu (startDate) không đúng định dạng hợp lệ.',
    );
    if (startResult.error) errors.push(startResult.error);

    const dueRaw = getField(record, 'Due Date', 'dueDate');
    const dueResult = parseDateField(
      dueRaw,
      'Ngày đến hạn (dueDate) không đúng định dạng hợp lệ.',
    );
    if (dueResult.error) errors.push(dueResult.error);

    const sprintRaw = getField(record, 'Sprint', 'sprint');
    const sprintLookup = lookupWithWarning(
      sprintRaw,
      maps.sprintMap,
      `Sprint '${sprintRaw}' không tồn tại. Sprint sẽ được để trống.`,
    );
    if (sprintLookup.warning) warnings.push(sprintLookup.warning);

    const labelIds: string[] = [];
    const labelsRaw = getField(record, 'Labels', 'labels');
    if (labelsRaw) {
      const names = labelsRaw
        .split(',')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      for (const name of names) {
        const lLookup = lookupWithWarning(
          name,
          maps.labelMap,
          `Label '${name}' không tồn tại và sẽ bị bỏ qua.`,
        );
        if (lLookup.id) labelIds.push(lLookup.id);
        else if (lLookup.warning) warnings.push(lLookup.warning);
      }
    }

    const teRaw = getField(record, 'Time Estimated (h)', 'timeEstimated');
    const teResult = parseNumericField(
      teRaw,
      { min: 0 },
      'Thời gian ước lượng (Time Estimated) phải là số dương.',
    );
    if (teResult.error) errors.push(teResult.error);

    const tlRaw = getField(record, 'Time Logged (h)', 'timeLogged');
    const tlResult = parseNumericField(
      tlRaw,
      { min: 0 },
      'Thời gian đã log (Time Logged) phải là số dương.',
    );
    if (tlResult.error) errors.push(tlResult.error);

    let rowStatus: 'valid' | 'error' | 'warning';
    if (errors.length > 0) {
      rowStatus = 'error';
    } else if (warnings.length > 0) {
      rowStatus = 'warning';
    } else {
      rowStatus = 'valid';
    }

    const data: Partial<CreateTaskDto> = {
      title,
      description,
      type: type.toLowerCase(),
      priority: priority.toLowerCase(),
      status,
    };

    if (assigneeLookup.id) data.assigneeId = assigneeLookup.id;
    if (spResult.value !== undefined) data.storyPoints = spResult.value;
    if (startResult.value) data.startDate = startResult.value;
    if (dueResult.value) data.dueDate = dueResult.value;
    if (sprintLookup.id) data.sprintId = sprintLookup.id;
    if (labelIds.length > 0) data.labelIds = labelIds;
    if (teResult.value !== undefined) data.timeEstimated = teResult.value;
    if (tlResult.value !== undefined) data.timeLogged = tlResult.value;

    return {
      rowIndex,
      title,
      status: rowStatus,
      errors,
      warnings,
      data,
    };
  }
}
