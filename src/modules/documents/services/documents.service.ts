// Facade service for documents module, integrating helper services to handle core business logic.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { promises as fs } from 'fs';
import { Model, Types } from 'mongoose';
import axios from 'axios';

import { DocumentDoc, DocumentEntity } from '../schemas/document.schema';
import { UploadDocumentDto } from '../dtos/upload-document.dto';
import {
  AttachDocumentDto,
  DetachDocumentDto,
} from '../dtos/attach-document.dto';
import { UpdateDocumentDto } from '../dtos/update-document.dto';
import { CreateOnlineDocumentDto } from '../dtos/create-online-document.dto';
import { UpdateDocumentContentDto } from '../dtos/update-document-content.dto';
import { UpdateDocumentWorkspacesDto } from '../dtos/update-document-workspaces.dto';

import { DocumentAccessService } from './document-access.service';
import { DocumentStorageService } from './document-storage.service';
import { DocumentSanitizerService } from './document-sanitizer.service';
import { DocumentVersionService } from './document-version.service';
import { DocumentConversionService } from './document-conversion.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { escapeRegex } from '../utils/document-html.util';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,

    private readonly accessService: DocumentAccessService,
    private readonly storageService: DocumentStorageService,
    private readonly sanitizerService: DocumentSanitizerService,
    private readonly versionService: DocumentVersionService,
    private readonly conversionService: DocumentConversionService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const name = dto.name?.trim() || file.originalname;
    const workspaceIds = (dto.workspaceIds ?? []).map(
      id => new Types.ObjectId(id),
    );

    for (const wsId of workspaceIds) {
      await this.accessService.getActiveWorkspaceAndMember(
        wsId.toString(),
        userId,
      );
    }

    await this.ensureUniqueNameForUser(userId, name);

    const firstWorkspaceId = workspaceIds[0]?.toString();
    const storedFile = await this.storageService.saveUploadedFile(
      file,
      firstWorkspaceId,
    );

    return this.documentModel.create({
      uploadedBy: new Types.ObjectId(userId),
      name,
      originalName: file.originalname,
      filename: storedFile.filename,
      storagePath: storedFile.storagePath,
      cloudinaryPublicId: storedFile.cloudinaryPublicId,
      mimeType: file.mimetype,
      extension: storedFile.extension,
      size: file.size,
      workspaceIds,
      deletedAt: null,
    });
  }

  async createOnline(userId: string, dto: CreateOnlineDocumentDto) {
    const name = dto.name.trim();
    const sanitizedContent = this.sanitizerService.sanitizeContent(
      dto.content ?? '',
    );
    const size = Buffer.byteLength(sanitizedContent, 'utf8');

    const workspaceIds = (dto.workspaceIds ?? []).map(
      id => new Types.ObjectId(id),
    );

    for (const wsId of workspaceIds) {
      await this.accessService.getActiveWorkspaceAndMember(
        wsId.toString(),
        userId,
      );
    }

    await this.ensureUniqueNameForUser(userId, name);

    const firstWorkspaceId = workspaceIds[0]?.toString();
    const storedFile = await this.storageService.saveHtmlContent(
      sanitizedContent,
      firstWorkspaceId,
      name,
    );

    return this.documentModel.create({
      uploadedBy: new Types.ObjectId(userId),
      name,
      originalName: `${name}${storedFile.extension}`,
      filename: storedFile.filename,
      storagePath: storedFile.storagePath,
      cloudinaryPublicId: storedFile.cloudinaryPublicId,
      mimeType: 'text/html',
      extension: storedFile.extension,
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
    return this.accessService.getMineById(userId, id);
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

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async deleteMine(userId: string, id: string) {
    const doc = await this.getMineById(userId, id);
    await this.documentModel.updateOne(
      { _id: doc._id },
      { $set: { deletedAt: new Date() } },
    );

    await this.storageService.deleteFile(
      doc.cloudinaryPublicId,
      doc.storagePath,
    );

    return { success: true };
  }

  async attach(userId: string, id: string, dto: AttachDocumentDto) {
    await this.getMineById(userId, id);

    for (const workspaceId of dto.workspaceIds) {
      await this.accessService.getActiveWorkspaceAndMember(workspaceId, userId);

      await this.documentModel.updateOne(
        {
          _id: new Types.ObjectId(id),
          uploadedBy: new Types.ObjectId(userId),
          deletedAt: null,
        },
        {
          $addToSet: {
            workspaceIds: new Types.ObjectId(workspaceId),
          },
        },
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
      {
        $pull: {
          workspaceIds: new Types.ObjectId(dto.workspaceId),
        },
      },
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
      await this.accessService.getActiveWorkspaceAndMember(
        wsId.toString(),
        userId,
      );
    }

    await this.documentModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        uploadedBy: new Types.ObjectId(userId),
        deletedAt: null,
      },
      {
        $set: {
          workspaceIds: objectIds,
        },
      },
    );

    return this.getMineById(userId, id);
  }

  async listByWorkspace(userId: string, workspaceId: string) {
    await this.accessService.getActiveWorkspaceAndMember(workspaceId, userId);

    return this.documentModel
      .find({
        workspaceIds: new Types.ObjectId(workspaceId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 });
  }

  async resolveDownloadable(userId: string, id: string) {
    return this.accessService.resolveDownloadable(userId, id);
  }

  async getContent(userId: string, id: string) {
    const doc = await this.resolveDownloadable(userId, id);

    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Content API is only available for online documents',
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

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (doc.uploadedBy.toString() !== userId) {
      throw new ForbiddenException('Only owner can update document content');
    }

    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Content API is only available for online documents',
      );
    }

    const sanitizedContent = this.sanitizerService.sanitizeContent(dto.content);
    const size = Buffer.byteLength(sanitizedContent, 'utf8');

    let storagePath = doc.storagePath;
    let cloudinaryPublicId = doc.cloudinaryPublicId;

    if (doc.storagePath.startsWith('http') || doc.cloudinaryPublicId) {
      const firstWorkspaceId = doc.workspaceIds?.[0]?.toString();
      const storedFile = await this.storageService.saveHtmlContent(
        sanitizedContent,
        firstWorkspaceId,
        doc.name,
      );
      storagePath = storedFile.storagePath;
      cloudinaryPublicId = storedFile.cloudinaryPublicId;

      if (doc.cloudinaryPublicId) {
        await this.storageService.deleteFile(doc.cloudinaryPublicId);
      }
    } else {
      await fs.writeFile(doc.storagePath, sanitizedContent, 'utf8');
    }

    return this.documentModel.findOneAndUpdate(
      { _id: doc._id },
      { $set: { size, storagePath, cloudinaryPublicId } },
      { new: true },
    );
  }

  async createVersion(userId: string, id: string, label: string) {
    return this.versionService.createVersion(userId, id, label);
  }

  async getVersions(userId: string, id: string) {
    return this.versionService.getVersions(userId, id);
  }

  async restoreVersion(userId: string, id: string, versionId: string) {
    return this.versionService.restoreVersion(userId, id, versionId);
  }

  async exportOnlineToDocx(
    userId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    return this.conversionService.exportOnlineToDocx(userId, id);
  }

  async importDocx(buffer: Buffer): Promise<string> {
    return this.conversionService.importDocx(buffer);
  }

  async renderPreviewHtml(doc: DocumentDoc): Promise<string | null> {
    return this.conversionService.renderPreviewHtml(doc);
  }

  private async ensureUniqueNameForUser(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const query: Record<string, any> = {
      uploadedBy: new Types.ObjectId(userId),
      deletedAt: null,
      name: {
        $regex: `^${escapeRegex(name)}$`,
        $options: 'i',
      },
    };

    if (excludeId) {
      query._id = {
        $ne: new Types.ObjectId(excludeId),
      };
    }

    const existingDocument = await this.documentModel.exists(query).exec();

    if (existingDocument) {
      throw new BadRequestException(
        'A document with this name already exists in your library',
      );
    }
  }
}
