// Service managing online document versions, including creating, listing, and restoring versions.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { promises as fs } from 'fs';
import { Model, Types } from 'mongoose';

import {
  DocumentVersionDoc,
  DocumentVersionEntity,
} from '../schemas/document-version.schema';
import { DocumentDoc, DocumentEntity } from '../schemas/document.schema';

import { DocumentAccessService } from './document-access.service';
import { DocumentSanitizerService } from './document-sanitizer.service';

@Injectable()
export class DocumentVersionService {
  constructor(
    @InjectModel(DocumentVersionEntity.name)
    private readonly documentVersionModel: Model<DocumentVersionDoc>,

    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,

    private readonly accessService: DocumentAccessService,
    private readonly sanitizerService: DocumentSanitizerService,
  ) {}

  async createVersion(userId: string, id: string, label: string) {
    const doc = await this.accessService.getOwnedOnlineDocument(userId, id);

    const htmlSnapshot = await fs.readFile(doc.storagePath, 'utf8');

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

    await fs.writeFile(doc.storagePath, sanitizedContent, 'utf8');

    return this.documentModel.findOneAndUpdate(
      { _id: doc._id },
      { $set: { size } },
      { new: true },
    );
  }
}
