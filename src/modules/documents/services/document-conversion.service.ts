// Service handling document format conversions, including exporting online documents to DOCX and importing from DOCX files.
import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import axios from 'axios';

import { DocumentDoc } from '../schemas/document.schema';
import { DocumentAccessService } from './document-access.service';
import { DocumentSanitizerService } from './document-sanitizer.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { escapeHtml } from '../utils/document-html.util';

@Injectable()
export class DocumentConversionService {
  constructor(
    private readonly accessService: DocumentAccessService,
    private readonly sanitizerService: DocumentSanitizerService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async exportOnlineToDocx(
    userId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.accessService.resolveDownloadable(userId, id);

    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'DOCX export is only available for online documents',
      );
    }

    let content = '';
    if (doc.storagePath.startsWith('http')) {
      let fetchUrl = doc.storagePath;
      if (doc.cloudinaryPublicId) {
        fetchUrl = this.cloudinaryService.getPrivateDownloadUrl(
          doc.cloudinaryPublicId,
          doc.mimeType?.startsWith('image/') ? 'image' : 'raw',
          doc.documentType === 'online' ? 'authenticated' : 'upload',
        );
      }
      const response = await axios.get(fetchUrl);
      content = response.data.toString();
    } else {
      content = await fs.readFile(doc.storagePath, 'utf8');
    }

    const htmlString = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.name)}</title>
  </head>
  <body>
    <h1>${escapeHtml(doc.name)}</h1>
    ${content}
  </body>
</html>`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const HTMLtoDOCX = require('html-to-docx');

      const buffer = await HTMLtoDOCX(htmlString, null, {
        orientation: 'portrait',
        margins: {
          top: 1440,
          bottom: 1440,
          left: 1440,
          right: 1440,
        },
      });

      const safeTitle = doc.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'document';

      return {
        buffer,
        filename: `${safeTitle}.docx`,
      };
    } catch {
      throw new BadRequestException('Failed to generate DOCX file');
    }
  }

  async importDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.convertToHtml({ buffer });

      return this.sanitizerService.sanitizeContent(result.value || '');
    } catch {
      throw new BadRequestException('Failed to parse Word document');
    }
  }

  private wrapPreviewHtml(title: string, body: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
      h1, h2, h3 { margin-top: 0; }
      .slide { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
  }

  async renderPreviewHtml(doc: DocumentDoc): Promise<string | null> {
    if (doc.documentType === 'online') {
      let content = '';
      if (doc.storagePath.startsWith('http')) {
        let fetchUrl = doc.storagePath;
        if (doc.cloudinaryPublicId) {
          fetchUrl = this.cloudinaryService.getPrivateDownloadUrl(
            doc.cloudinaryPublicId,
            doc.mimeType?.startsWith('image/') ? 'image' : 'raw',
            'authenticated',
          );
        }
        const response = await axios.get(fetchUrl);
        content = response.data.toString();
      } else {
        content = await fs.readFile(doc.storagePath, 'utf8');
      }

      return this.wrapPreviewHtml(doc.name, content);
    }

    let buffer: Buffer;
    if (doc.storagePath.startsWith('http')) {
      let fetchUrl = doc.storagePath;
      if (doc.cloudinaryPublicId) {
        fetchUrl = this.cloudinaryService.getPrivateDownloadUrl(
          doc.cloudinaryPublicId,
          doc.mimeType?.startsWith('image/') ? 'image' : 'raw',
          'upload',
        );
      }
      const response = await axios.get(fetchUrl, {
        responseType: 'arraybuffer',
      });
      buffer = Buffer.from(response.data);
    } else {
      buffer = await fs.readFile(doc.storagePath);
    }

    if (doc.extension === '.docx') {
      const result = await mammoth.convertToHtml({ buffer });

      return this.wrapPreviewHtml(
        doc.name,
        result.value || '<p>No preview content.</p>',
      );
    }

    if (doc.extension === '.xlsx') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      const sections = workbook.SheetNames.slice(0, 3).map(name => {
        const sheet = workbook.Sheets[name];
        const html = XLSX.utils.sheet_to_html(sheet);

        return `<h3>${escapeHtml(name)}</h3>${html}`;
      });

      return this.wrapPreviewHtml(
        doc.name,
        sections.join('') || '<p>No preview content.</p>',
      );
    }

    if (doc.extension === '.pptx') {
      const zip = await JSZip.loadAsync(buffer);

      const slideFiles = Object.keys(zip.files)
        .filter(key => /^ppt\/slides\/slide\d+\.xml$/.test(key))
        .sort((a, b) => {
          const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
          const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] || '0');

          return numA - numB;
        });

      const slidesHtml: string[] = [];

      for (let i = 0; i < slideFiles.length; i += 1) {
        const xml = await zip.files[slideFiles[i]].async('string');

        const matches = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];

        const texts = matches
          .map(m => m[1])
          .filter(Boolean)
          .map(t => escapeHtml(t));

        slidesHtml.push(
          `<div class="slide"><h3>Slide ${i + 1}</h3>${
            texts.length
              ? texts.map(t => `<p>${t}</p>`).join('')
              : '<p>(No text)</p>'
          }</div>`,
        );
      }

      return this.wrapPreviewHtml(
        doc.name,
        slidesHtml.join('') || '<p>No preview content.</p>',
      );
    }

    return null;
  }
}
