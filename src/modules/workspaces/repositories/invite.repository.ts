import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Invite,
  InviteDocument,
  INVITE_STATUS,
} from '../schemas/invite.schema';

@Injectable()
export class InviteRepository {
  constructor(
    @InjectModel(Invite.name)
    private readonly inviteModel: Model<InviteDocument>,
  ) {}

  async create(data: Partial<Invite>): Promise<Invite> {
    const doc = new this.inviteModel(data);
    return doc.save();
  }

  async findPendingByWorkspace(workspaceId: string): Promise<Invite[]> {
    return this.inviteModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        status: INVITE_STATUS.PENDING,
      })
      .populate('invitedBy', 'fullName email avatar')
      .lean()
      .exec();
  }

  async findPendingByEmailAndWorkspace(
    email: string,
    workspaceId: string,
  ): Promise<Invite | null> {
    return this.inviteModel
      .findOne({
        invitedEmail: email.toLowerCase(),
        workspaceId: new Types.ObjectId(workspaceId),
        status: INVITE_STATUS.PENDING,
      })
      .lean()
      .exec();
  }

  async findByToken(token: string): Promise<Invite | null> {
    return this.inviteModel
      .findOne({ token })
      .populate('invitedBy', 'fullName email avatar')
      .lean()
      .exec();
  }

  async findPendingValidByEmail(email: string): Promise<Invite[]> {
    return this.inviteModel
      .find({
        invitedEmail: email.toLowerCase(),
        status: INVITE_STATUS.PENDING,
      })
      .lean()
      .exec();
  }

  async findById(inviteId: string): Promise<Invite | null> {
    return this.inviteModel.findById(inviteId).lean().exec();
  }

  async findByIdWithInviter(inviteId: string): Promise<Invite | null> {
    return this.inviteModel
      .findById(inviteId)
      .populate('invitedBy', 'fullName email avatar')
      .lean()
      .exec();
  }

  async updateStatus(inviteId: string, status: string): Promise<Invite | null> {
    return this.inviteModel
      .findByIdAndUpdate(inviteId, { status }, { new: true })
      .lean()
      .exec();
  }

  async addAcceptedBy(
    inviteId: string,
    userId: string,
  ): Promise<Invite | null> {
    return this.inviteModel
      .findByIdAndUpdate(
        inviteId,
        { $addToSet: { acceptedBy: new Types.ObjectId(userId) } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
