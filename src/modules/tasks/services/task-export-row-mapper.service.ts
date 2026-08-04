import { Injectable } from '@nestjs/common';
import { TaskDocument } from '../schemas/task.schema';
import { ResolvedMaps } from './task-export-lookup.service';

const CSV_INJECTION_CHARS = ['=', '+', '-', '@'];

@Injectable()
export class TaskExportRowMapperService {
  toRow(
    task: TaskDocument,
    resolved: ResolvedMaps,
    baseUrl: string,
    workspaceId: string,
  ): string[] {
    const plain = typeof task.toObject === 'function' ? task.toObject() : task;

    const aId = this.extractId(plain.assigneeId);
    let assigneeName = aId ? resolved.users.get(aId) : '';
    if (!assigneeName && plain.assigneeId?.fullName) {
      assigneeName = plain.assigneeId.fullName;
    } else if (!assigneeName && plain.assigneeId?.email) {
      assigneeName = plain.assigneeId.email;
    }
    assigneeName = assigneeName || '';

    const rId = this.extractId(plain.reporterId);
    let reporterName = rId ? resolved.users.get(rId) : '';
    if (!reporterName && plain.reporterId?.fullName) {
      reporterName = plain.reporterId.fullName;
    } else if (!reporterName && plain.reporterId?.email) {
      reporterName = plain.reporterId.email;
    }
    reporterName = reporterName || '';

    const cId = this.extractId(plain.columnId);
    const statusName = cId
      ? resolved.columns.get(cId) || plain.status || ''
      : plain.status || '';

    const sId = this.extractId(plain.sprintId);
    let sprintName = sId ? resolved.sprints.get(sId) : '';
    if (!sprintName && plain.sprintId?.name) {
      sprintName = plain.sprintId.name;
    }
    sprintName = sprintName || '';

    const labelNames = (plain.labelIds || [])
      .map((idVal: any) => {
        const lId = this.extractId(idVal);
        let name = lId ? resolved.labels.get(lId) : '';
        if (!name && idVal?.name) name = idVal.name;
        return name || '';
      })
      .filter(Boolean)
      .join(', ');

    const description = this.stripMarkdown(plain.description || '');
    const taskUrl = `${baseUrl}/workspaces/${workspaceId}?tab=list&task=${plain.key}`;
    const typeName = this.capitalize(plain.type || '');
    const priorityName = this.capitalize(plain.priority || '');

    const parentKey = plain.parentId?.key || '';

    return [
      this.escapeCsvInjection(plain.key || ''),
      this.escapeCsvInjection(plain.title || ''),
      this.escapeCsvInjection(parentKey),
      this.escapeCsvInjection(description),
      typeName,
      statusName,
      priorityName,
      assigneeName,
      reporterName,
      plain.storyPoints != null ? String(plain.storyPoints) : '',
      labelNames,
      sprintName,
      plain.startDate ? this.formatDate(plain.startDate) : '',
      plain.dueDate ? this.formatDate(plain.dueDate) : '',
      plain.timeLogged != null ? String(plain.timeLogged) : '0',
      plain.timeEstimated != null ? String(plain.timeEstimated) : '',
      plain.createdAt ? this.formatDate(plain.createdAt) : '',
      plain.updatedAt ? this.formatDate(plain.updatedAt) : '',
      taskUrl,
    ];
  }

  private extractId(val: any): string | null {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val._id) return val._id.toString();
    if (val.id) return val.id.toString();
    return val.toString();
  }

  private escapeCsvInjection(value: string): string {
    if (!value) return value;
    const trimmed = value.trimStart();
    if (trimmed.length > 0 && CSV_INJECTION_CHARS.includes(trimmed.charAt(0))) {
      return "'" + value;
    }
    return value;
  }

  private stripMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/#{1,6}\s?/g, '')
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, match => match.replace(/`/g, ''))
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/---+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private capitalize(value: string): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
}
