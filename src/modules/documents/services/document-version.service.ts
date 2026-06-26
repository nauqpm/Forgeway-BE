// Service managing online document versions, including creating, listing, and restoring versions.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { promises as fs } from 'fs';
import { Model, Types } from 'mongoose';
import axios from 'axios';

import {
  DocumentVersionDoc,
  DocumentVersionEntity,
} from '../schemas/document-version.schema';
import { DocumentDoc, DocumentEntity } from '../schemas/document.schema';

import { DocumentAccessService } from './document-access.service';
import { DocumentSanitizerService } from './document-sanitizer.service';
import { DocumentStorageService } from './document-storage.service';

@Injectable()
export class DocumentVersionService {
  constructor(
    @InjectModel(DocumentVersionEntity.name)
    private readonly documentVersionModel: Model<DocumentVersionDoc>,

    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,

    private readonly accessService: DocumentAccessService,
    private readonly sanitizerService: DocumentSanitizerService,
    private readonly storageService: DocumentStorageService,
  ) {}

  async createVersion(userId: string, id: string, label: string) {
    const doc = await this.accessService.getOwnedOnlineDocument(userId, id);

    let htmlSnapshot = '';
    if (doc.storagePath.startsWith('http')) {
      const response = await axios.get(doc.storagePath);
      htmlSnapshot = response.data.toString();
    } else {
      htmlSnapshot = await fs.readFile(doc.storagePath, 'utf8');
    }

    const version =
      (await this.documentVersionModel
        .countDocuments({
          documentId: doc._id,
        })
        .exec()) + 1;

    return this.documentVersionModel.create({
      documentId: doc._id,
      htmlSnapshot,
      label: label.trim(),
      version,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async getVersions(userId: string, id: string) {
    const doc = await this.accessService.resolveDownloadable(userId, id);

    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Version history is only available for online documents',
      );
    }

    return this.documentVersionModel
      .find({ documentId: doc._id })
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async restoreVersion(userId: string, id: string, versionId: string) {
    const doc = await this.accessService.getOwnedOnlineDocument(userId, id);

    const version = await this.documentVersionModel
      .findOne({
        _id: new Types.ObjectId(versionId),
        documentId: doc._id,
      })
      .exec();

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    const sanitizedContent = this.sanitizerService.sanitizeContent(
      version.htmlSnapshot,
    );

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
}
