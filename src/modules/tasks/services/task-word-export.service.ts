import { Injectable, StreamableFile } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';
import { TaskDocument } from '../schemas/task.schema';
import { ResolvedMaps } from './task-export-lookup.service';

@Injectable()
export class TaskWordExportService {
  private dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private formatDate(dateInput: any): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(2);
    return `${day}/${month}/${year}`;
  }

  private stripMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/#+\s*/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/>\s*/g, '')
      .trim();
  }

  async buildDocx(
    tasks: TaskDocument[],
    resolved: ResolvedMaps,
    baseUrl: string,
    workspaceId: string,
  ): Promise<{ file: StreamableFile; contentType: string; filename: string }> {
    const children: any[] = [];

    const cellPadding = { top: 100, bottom: 100, left: 100, right: 100 };
    const border = {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' },
    };

    const extractId = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (val._id) return val._id.toString();
      if (val.id) return val.id.toString();
      return val.toString();
    };

    for (const task of tasks) {
      const plain =
        typeof task.toObject === 'function' ? task.toObject() : task;

      const aId = extractId(plain.assigneeId);
      let assigneeName = aId ? resolved.users.get(aId) : '';
      if (!assigneeName && plain.assigneeId?.fullName)
        assigneeName = plain.assigneeId.fullName;
      else if (!assigneeName && plain.assigneeId?.email)
        assigneeName = plain.assigneeId.email;
      assigneeName = assigneeName || 'Unassigned';

      const rId = extractId(plain.reporterId);
      let reporterName = rId ? resolved.users.get(rId) : '';
      if (!reporterName && plain.reporterId?.fullName)
        reporterName = plain.reporterId.fullName;
      else if (!reporterName && plain.reporterId?.email)
        reporterName = plain.reporterId.email;
      reporterName = reporterName || 'Unknown';

      const sId = extractId(plain.sprintId);
      let sprintName = sId ? resolved.sprints.get(sId) : '';
      if (!sprintName && plain.sprintId?.name) sprintName = plain.sprintId.name;
      sprintName = sprintName || 'None';

      const labelNames =
        (plain.labelIds || [])
          .map((idVal: any) => {
            const lId = extractId(idVal);
            let name = lId ? resolved.labels.get(lId) : '';
            if (!name && idVal?.name) name = idVal.name;
            return name || '';
          })
          .filter(Boolean)
          .join(', ') || 'None';

      const titleRun = new TextRun({
        text: `[${plain.key}] ${plain.title || ''}`,
        bold: true,
        size: 28,
        color: '0052CC',
      });
      const datesRun = new TextRun({
        text: `  Created: ${this.formatDate(plain.createdAt || '')}  Updated: ${this.formatDate(plain.updatedAt || '')}`,
        size: 18,
        color: '666666',
      });

      // Table 1: Header info
      const table1 = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: border,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 2,
                margins: cellPadding,
                shading: { fill: 'F4F5F7', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [titleRun, datesRun] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Status:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 80, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [new Paragraph(plain.status || '')],
              }),
            ],
          }),
        ],
      });

      // Table 2: Details
      const table2 = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: border,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Type:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                columnSpan: 3,
                width: { size: 80, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [new Paragraph(this.capitalize(plain.type || ''))],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Reporter:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [new Paragraph(reporterName)],
              }),
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Assignee:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                margins: cellPadding,
                children: [new Paragraph(assigneeName)],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Priority:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph(this.capitalize(plain.priority || '')),
                ],
              }),
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Story Points:', bold: true }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph(
                    plain.storyPoints != null ? String(plain.storyPoints) : '0',
                  ),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Labels:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                columnSpan: 3,
                margins: cellPadding,
                children: [new Paragraph(labelNames)],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Sprint:', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                columnSpan: 3,
                margins: cellPadding,
                children: [new Paragraph(sprintName)],
              }),
            ],
          }),
        ],
      });

      // Table 3: Description
      const table3 = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: border,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                margins: cellPadding,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Description:', bold: true }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                margins: { top: 200, bottom: 200, left: 100, right: 100 },
                children: this.stripMarkdown(plain.description || '')
                  .split('\n')
                  .map(line => new Paragraph(line || ' ')),
              }),
            ],
          }),
        ],
      });

      children.push(table1);
      children.push(
        new Paragraph({ text: '', spacing: { before: 50, after: 50 } }),
      );
      children.push(table2);
      children.push(
        new Paragraph({ text: '', spacing: { before: 50, after: 50 } }),
      );
      children.push(table3);
      children.push(
        new Paragraph({ text: '', spacing: { before: 400, after: 200 } }),
      );
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `tasks-${workspaceId}-${this.dateStamp()}.docx`;

    return {
      file: new StreamableFile(buffer),
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename,
    };
  }
}
