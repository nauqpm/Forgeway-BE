import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { extname, resolve, join } from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';
import sanitizeHtml = require('sanitize-html');
import { DocumentDoc, DocumentEntity } from '../schemas/document.schema';
import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';
import { UploadDocumentDto } from '../dtos/upload-document.dto';
import {
  AttachDocumentDto,
  DetachDocumentDto,
} from '../dtos/attach-document.dto';
import { UpdateDocumentDto } from '../dtos/update-document.dto';
import { CreateOnlineDocumentDto } from '../dtos/create-online-document.dto';
import { UpdateDocumentContentDto } from '../dtos/update-document-content.dto';
import { UpdateDocumentWorkspacesDto } from '../dtos/update-document-workspaces.dto';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  private getDynamicPath(subfolder: string = 'documents'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return join('uploads', subfolder, String(year), month, day);
  }

  private ensureDirExists(path: string) {
    const fullPath = resolve(process.cwd(), path);
    if (!fsSync.existsSync(fullPath)) {
      fsSync.mkdirSync(fullPath, { recursive: true });
    }
  }

  private ensureAllowedType(file: Express.Multer.File): string {
    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Unsupported file type');
    }

    const buf = file.buffer;
    const startsWith = (...bytes: number[]) =>
      bytes.every((b, i) => buf[i] === b);
    const isPdf = startsWith(0x25, 0x50, 0x44, 0x46);
    const isZip = startsWith(0x50, 0x4b, 0x03, 0x04);
    const isPng = startsWith(0x89, 0x50, 0x4e, 0x47);
    const isJpeg = startsWith(0xff, 0xd8, 0xff);
    const isWebp =
      startsWith(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    const isOle = startsWith(0xd0, 0xcf, 0x11, 0xe0);

    const valid =
      (extension === '.pdf' && isPdf) ||
      (['.docx', '.xlsx', '.pptx'].includes(extension) && isZip) ||
      (['.doc', '.xls', '.ppt'].includes(extension) && isOle) ||
      (extension === '.png' && isPng) ||
      (['.jpg', '.jpeg'].includes(extension) && isJpeg) ||
      (extension === '.webp' && isWebp);

    if (!valid) {
      throw new BadRequestException('Unsupported file type');
    }

    return extension;
  }

  private sanitizeContent(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
        'p',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'blockquote',
        'a',
        'img',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'br',
        'span',
      ],
      allowedAttributes: {
        a: ['href', 'name', 'target'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        span: ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
  }

  private async getActiveWorkspaceAndMember(
    workspaceId: string,
    userId: string,
  ) {
    const workspace = await this.workspaceModel.findOne({
      _id: new Types.ObjectId(workspaceId),
      deletedAt: null,
      $or: [{ ownerId: new Types.ObjectId(userId) }, { 'members.userId': new Types.ObjectId(userId) }],
    });
    if (!workspace) {
      throw new ForbiddenException('Workspace is deleted or inactive');
    }
    return workspace;
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > 20 * 1024 * 1024)
      throw new BadRequestException('File size exceeds limit');
    const extension = this.ensureAllowedType(file);
    const name = dto.name?.trim() || file.originalname;

    const workspaceIds = (dto.workspaceIds ?? []).map(id => new Types.ObjectId(id));
    for (const wsId of workspaceIds) {
      await this.getActiveWorkspaceAndMember(wsId.toString(), userId);
    }

    await this.ensureUniqueNameForUser(userId, name);

    const relativePath = this.getDynamicPath('documents');
    this.ensureDirExists(relativePath);

    const filename = `${randomUUID()}${extension}`;
    const storagePath = resolve(process.cwd(), relativePath, filename);
    await fs.writeFile(storagePath, file.buffer);

    await this.ensureUniqueNameForUser(userId, name);
    await fs.mkdir(resolve(process.cwd(), 'uploads'), { recursive: true });
    await fs.writeFile(storagePath, file.buffer);

    const created = await this.documentModel.create({
      uploadedBy: new Types.ObjectId(userId),
      name,
      originalName: file.originalname,
      filename,
      storagePath,
      mimeType: file.mimetype,
      extension,
      size: file.size,
      workspaceIds,
      deletedAt: null,
    });

    return created;
  }

  async createOnline(userId: string, dto: CreateOnlineDocumentDto) {
    const name = dto.name.trim();
    const rawContent = dto.content ?? '';
    const sanitizedContent = this.sanitizeContent(rawContent);
    const size = Buffer.byteLength(sanitizedContent, 'utf8');

    const workspaceIds = (dto.workspaceIds ?? []).map(id => new Types.ObjectId(id));
    for (const wsId of workspaceIds) {
      await this.getActiveWorkspaceAndMember(wsId.toString(), userId);
    }

    const relativePath = this.getDynamicPath('documents');
    this.ensureDirExists(relativePath);
    await this.ensureUniqueNameForUser(userId, name);

    const extension = '.html';
    const filename = `${randomUUID()}${extension}`;
    const storagePath = resolve(process.cwd(), relativePath, filename);
    await fs.writeFile(storagePath, sanitizedContent, 'utf8');

    return this.documentModel.create({
      uploadedBy: new Types.ObjectId(userId),
      name,
      originalName: `${name}${extension}`,
      filename,
      storagePath,
      mimeType: 'text/html',
      extension,
      size,
      documentType: 'online',
      workspaceIds,
      deletedAt: null,
    });
  }

  async listMine(userId: string) {
    return this.documentModel
      .find({
        uploadedBy: new Types.ObjectId(userId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 });
  }

  async listAll() {
    return this.documentModel.find({ deletedAt: null }).sort({ createdAt: -1 });
  }

  async getMineById(userId: string, id: string) {
    const doc = await this.documentModel.findOne({
      _id: new Types.ObjectId(id),
      uploadedBy: new Types.ObjectId(userId),
      deletedAt: null,
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async updateMine(userId: string, id: string, dto: UpdateDocumentDto) {
    const name = dto.name.trim();
    await this.ensureUniqueNameForUser(userId, name, id);

    const doc = await this.documentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        uploadedBy: new Types.ObjectId(userId),
        deletedAt: null,
      },
      {
        $set: { name },
      },
      {
        new: true,
      },
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async deleteMine(userId: string, id: string) {
    const doc = await this.getMineById(userId, id);
    await this.documentModel.updateOne(
      { _id: doc._id },
      { $set: { deletedAt: new Date() } },
    );
    try {
      await fs.unlink(doc.storagePath);
    } catch {}
    return { success: true };
  }

  async attach(userId: string, id: string, dto: AttachDocumentDto) {
    await this.getMineById(userId, id);
    for (const workspaceId of dto.workspaceIds) {
      await this.getActiveWorkspaceAndMember(workspaceId, userId);
      await this.documentModel.updateOne(
        {
          _id: new Types.ObjectId(id),
          uploadedBy: new Types.ObjectId(userId),
          deletedAt: null,
        },
        { $addToSet: { workspaceIds: new Types.ObjectId(workspaceId) } },
      );
    }
    return this.getMineById(userId, id);
  }

  async detach(userId: string, id: string, dto: DetachDocumentDto) {
    await this.getMineById(userId, id);
    await this.documentModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        uploadedBy: new Types.ObjectId(userId),
        deletedAt: null,
      },
      { $pull: { workspaceIds: new Types.ObjectId(dto.workspaceId) } },
    );
    return this.getMineById(userId, id);
  }

  async updateWorkspaces(
    userId: string,
    id: string,
    dto: UpdateDocumentWorkspacesDto,
  ) {
    await this.getMineById(userId, id);
    const objectIds = dto.workspaceIds.map(wsId => new Types.ObjectId(wsId));
    for (const wsId of objectIds) {
      await this.getActiveWorkspaceAndMember(wsId.toString(), userId);
    }
    await this.documentModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        uploadedBy: new Types.ObjectId(userId),
        deletedAt: null,
      },
      { $set: { workspaceIds: objectIds } },
    );
    return this.getMineById(userId, id);
  }

  async listByWorkspace(userId: string, workspaceId: string) {
    await this.getActiveWorkspaceAndMember(workspaceId, userId);
    return this.documentModel
      .find({
        workspaceIds: new Types.ObjectId(workspaceId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 });
  }

  async resolveDownloadable(userId: string, id: string) {
    const doc = await this.documentModel.findOne({
      _id: new Types.ObjectId(id),
      deletedAt: null,
    });
    if (!doc) throw new NotFoundException('Document not found');

    if (doc.uploadedBy.toString() === userId) return doc;

    const activeMemberWorkspace = await this.workspaceModel.findOne({
      _id: { $in: doc.workspaceIds },
      deletedAt: null,
      $or: [{ ownerId: new Types.ObjectId(userId) }, { 'members.userId': new Types.ObjectId(userId) }],
    });

    if (!activeMemberWorkspace)
      throw new ForbiddenException('You do not have access to this document');
    return doc;
  }

  async getContent(userId: string, id: string) {
    const doc = await this.resolveDownloadable(userId, id);
    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Content API is only available for online documents',
      );
    }

    const content = await fs.readFile(doc.storagePath, 'utf8');
    return { content };
  }

  async updateContent(
    userId: string,
    id: string,
    dto: UpdateDocumentContentDto,
  ) {
    const doc = await this.documentModel.findOne({
      _id: new Types.ObjectId(id),
      deletedAt: null,
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.uploadedBy.toString() !== userId) {
      throw new ForbiddenException('Only owner can update document content');
    }
    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Content API is only available for online documents',
      );
    }

    const sanitizedContent = this.sanitizeContent(dto.content);
    const size = Buffer.byteLength(sanitizedContent, 'utf8');
    await fs.writeFile(doc.storagePath, sanitizedContent, 'utf8');

    const updated = await this.documentModel.findOneAndUpdate({ _id: doc._id }, { $set: { size } }, { new: true });

    return updated;
  }

  private async ensureUniqueNameForUser(userId: string, name: string, excludeId?: string): Promise<void> {
    const query: Record<string, any> = {
      uploadedBy: new Types.ObjectId(userId),
      deletedAt: null,
      name: { $regex: `^${this.escapeRegex(name)}$`, $options: 'i' },
    };

    if (excludeId) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existingDocument = await this.documentModel.exists(query).exec();
    if (existingDocument) {
      throw new BadRequestException('A document with this name already exists in your library');
    }
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private wrapPreviewHtml(title: string, body: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(title)}</title>
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
      const content = await fs.readFile(doc.storagePath, 'utf8');
      return this.wrapPreviewHtml(doc.name, content);
    }

    const buffer = await fs.readFile(doc.storagePath);

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
        return `<h3>${this.escapeHtml(name)}</h3>${html}`;
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
          .map(t => this.escapeHtml(t));
        slidesHtml.push(
          `<div class="slide"><h3>Slide ${i + 1}</h3>${texts.length ? texts.map(t => `<p>${t}</p>`).join('') : '<p>(No text)</p>'}</div>`,
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
