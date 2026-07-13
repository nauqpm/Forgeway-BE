import * as ExcelJS from 'exceljs';

export class XlsxStyleHelper {
  static applyHeaderStyle(worksheet: ExcelJS.Worksheet, rowNumber = 1): void {
    const headerRow = worksheet.getRow(rowNumber);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF263238' },
    };
    headerRow.alignment = { horizontal: 'center' };
  }

  static applyTypeValidation(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    for (let i = 2; i <= maxRows; i++) {
      worksheet.getCell(`${columnLetter}${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Task,Bug,Story,Epic"'],
      };
    }
  }

  static applyPriorityValidation(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    for (let i = 2; i <= maxRows; i++) {
      worksheet.getCell(`${columnLetter}${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Lowest,Low,Medium,High,Highest"'],
      };
    }
  }

  static applyStatusValidation(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    for (let i = 2; i <= maxRows; i++) {
      worksheet.getCell(`${columnLetter}${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"To Do,In Progress,Done,In Process"'],
      };
    }
  }

  static applyTypeConditionalFormatting(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    worksheet.addConditionalFormatting({
      ref: `${columnLetter}2:${columnLetter}${maxRows}`,
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Task"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Bug"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Story"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Epic"'], style: { font: { color: { argb: 'FF9333EA' }, bold: true } } },
      ] as any
    });
  }

  static applyPriorityConditionalFormatting(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    worksheet.addConditionalFormatting({
      ref: `${columnLetter}2:${columnLetter}${maxRows}`,
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"Highest"'], style: { font: { color: { argb: 'FF8B0000' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"High"'], style: { font: { color: { argb: 'FFDC2626' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Medium"'], style: { font: { color: { argb: 'FFD97706' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Low"'], style: { font: { color: { argb: 'FF2563EB' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Lowest"'], style: { font: { color: { argb: 'FF16A34A' }, bold: true } } },
      ] as any
    });
  }

  static applyStatusConditionalFormatting(worksheet: ExcelJS.Worksheet, columnLetter: string, maxRows = 1000): void {
    worksheet.addConditionalFormatting({
      ref: `${columnLetter}2:${columnLetter}${maxRows}`,
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['"To do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"To Do"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Process"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"In Progress"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C6500' }, bold: true } } },
        { type: 'cellIs', operator: 'equal', formulae: ['"Done"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' }, bold: true } } },
      ] as any
    });
  }
}
