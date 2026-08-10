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
      errors.push('Title cannot be empty.');
    } else if (title.length > 255) {
      errors.push('Title exceeds 255 characters.');
    }

    const description = getField(record, 'Description', 'description');
    if (description.length > 5000) {
      errors.push('Description exceeds 5000 characters.');
    }

    const type = getField(record, 'Type', 'type') || 'task';
    if (!TASK_TYPES.includes(type.toLowerCase() as any)) {
      errors.push(
        `Invalid task type. Must be one of: ${TASK_TYPES.join(', ')}.`,
      );
    }

    const priority = getField(record, 'Priority', 'priority') || 'medium';
    if (!TASK_PRIORITIES.includes(priority.toLowerCase() as any)) {
      errors.push(
        `Invalid priority. Must be one of: ${TASK_PRIORITIES.join(', ')}.`,
      );
    }

    const statusRaw = getField(record, 'Status', 'status');
    const status = statusRaw || 'todo';

    if (statusRaw && maps.kanbanColumns) {
      const normalizedStatus = statusRaw.toLowerCase();
      let column = maps.kanbanColumns.find(
        item =>
          item.id.toLowerCase() === normalizedStatus ||
          item.name.toLowerCase() === normalizedStatus ||
          (item.mappedStatuses || []).some(
            s => s.toLowerCase() === normalizedStatus,
          ),
      );

      if (!column && normalizedStatus === 'in process') {
        const fallbackStatus = 'in progress';
        column = maps.kanbanColumns.find(
          item =>
            item.id.toLowerCase() === fallbackStatus ||
            item.id.toLowerCase() === 'in-progress' ||
            item.name.toLowerCase() === fallbackStatus ||
            (item.mappedStatuses || []).some(
              s => s.toLowerCase() === fallbackStatus,
            ),
        );
      }
      if (!column) {
        const available = maps.kanbanColumns.map(c => `'${c.name}'`).join(', ');
        errors.push(
          `Status "${statusRaw}" does not map to any column in this board. Available: ${available}`,
        );
      }
    }

    const assigneeEmailRaw = getField(
      record,
      'Assignee Email',
      'assigneeEmail',
    );
    const assigneeLookup = lookupWithWarning(
      assigneeEmailRaw,
      maps.userEmailMap,
      `Email '${assigneeEmailRaw}' does not belong to the workspace. Assignee will be left blank.`,
    );
    if (assigneeLookup.warning) warnings.push(assigneeLookup.warning);

    const spRaw = getField(record, 'Story Points', 'storyPoints');
    const spResult = parseNumericField(
      spRaw,
      { min: 0, max: 100 },
      'Story points must be a valid number between 0 and 100.',
    );
    if (spResult.error) errors.push(spResult.error);

    const startRaw = getField(record, 'Start Date', 'startDate');
    const startResult = parseDateField(
      startRaw,
      'Start date is in an invalid format.',
    );
    if (startResult.error) errors.push(startResult.error);

    const dueRaw = getField(record, 'Due Date', 'dueDate');
    const dueResult = parseDateField(
      dueRaw,
      'Due date is in an invalid format.',
    );
    if (dueResult.error) errors.push(dueResult.error);

    const sprintRaw = getField(record, 'Sprint', 'sprint');
    const sprintLookup = lookupWithWarning(
      sprintRaw,
      maps.sprintMap,
      `Sprint '${sprintRaw}' does not exist. Sprint will be left blank.`,
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
          `Label '${name}' does not exist and will be skipped.`,
        );
        if (lLookup.id) labelIds.push(lLookup.id);
        else if (lLookup.warning) warnings.push(lLookup.warning);
      }
    }

    const teRaw = getField(record, 'Time Estimated (h)', 'timeEstimated');
    const teResult = parseNumericField(
      teRaw,
      { min: 0 },
      'Time Estimated must be a positive number.',
    );
    if (teResult.error) errors.push(teResult.error);

    const tlRaw = getField(record, 'Time Logged (h)', 'timeLogged');
    const tlResult = parseNumericField(
      tlRaw,
      { min: 0 },
      'Time Logged must be a positive number.',
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

    const parentKeyRaw = getField(record, 'Parent Key', 'parentKey');
    if (parentKeyRaw) {
      const parentKeyStr = parentKeyRaw.toString().trim().toLowerCase();
      const parentLookup = maps.taskKeyMap.get(parentKeyStr);

      if (!parentLookup) {
        warnings.push(
          `Parent task '${parentKeyRaw}' does not exist in this workspace. Subtask relationship will not be created.`,
        );
      } else {
        data.parentId = parentLookup.id;

        if (parentLookup.type === 'epic') {
          errors.push(
            `Cannot set an Epic ('${parentKeyRaw}') as a parent for a subtask.`,
          );
        } else if (parentLookup.type === 'subtask') {
          errors.push(
            `Parent task '${parentKeyRaw}' is already a subtask. Only one level of nesting is allowed.`,
          );
        }

        // A valid parent key implies the imported row must be a subtask.
        if (data.type !== 'subtask') {
          errors.push(
            `Task has a Parent Key but its type is '${data.type}'. Type must be 'subtask' when a parent is provided.`,
          );
        }
      }
    } else if (data.type === 'subtask') {
      errors.push(`Task type is 'Subtask' but no Parent Key is provided.`);
    }

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
