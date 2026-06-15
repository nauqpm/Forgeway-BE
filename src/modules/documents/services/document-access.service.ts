// Service managing document access permissions, checking user access to documents and workspaces, and checking downloadability.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { DocumentDoc, DocumentEntity } from '../schemas/document.schema';
import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';

@Injectable()
export class DocumentAccessService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentDoc>,

    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  async getActiveWorkspaceAndMember(workspaceId: string, userId: string) {
    const workspace = await this.workspaceModel.findOne({
      _id: new Types.ObjectId(workspaceId),
      deletedAt: null,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });

    if (!workspace) {
      throw new ForbiddenException('Workspace is deleted or inactive');
    }

    return workspace;
  }

  async getMineById(userId: string, id: string) {
    const doc = await this.documentModel.findOne({
      _id: new Types.ObjectId(id),
      uploadedBy: new Types.ObjectId(userId),
      deletedAt: null,
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async resolveDownloadable(userId: string, id: string) {
    const doc = await this.documentModel.findOne({
      _id: new Types.ObjectId(id),
      deletedAt: null,
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (doc.uploadedBy.toString() === userId) {
      return doc;
    }

    const activeMemberWorkspace = await this.workspaceModel.findOne({
      _id: { $in: doc.workspaceIds },
      deletedAt: null,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });

    if (!activeMemberWorkspace) {
      throw new ForbiddenException('You do not have access to this document');
    }

    return doc;
  }

  async getOwnedOnlineDocument(userId: string, id: string) {
    const doc = await this.getMineById(userId, id);

    if (doc.documentType !== 'online') {
      throw new BadRequestException(
        'Content API is only available for online documents',
      );
    }

    return doc;
  }
}
