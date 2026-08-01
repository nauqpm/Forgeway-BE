import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { createStoryContentHash } from '../utils/story-content-hash.util';

export type AcceptanceCriterionInput = {
  key: string;
  priority: 'MUST' | 'SHOULD' | 'COULD';
  statement: string;
  given?: string;
  when?: string;
  then?: string;
  verificationMethod: string;
};

@Injectable()
export class AcceptanceCriterionService {
  constructor(
    @InjectModel('AcceptanceCriterion')
    private readonly criterionModel: Model<any>,
    @InjectModel('AcceptanceCriterionRevision')
    private readonly revisionModel: Model<any>,
  ) {}

  async resolveForSubmission(
    workspaceId: string,
    storyContractId: string,
    inputs: AcceptanceCriterionInput[],
    userId: string,
    session: ClientSession,
  ) {
    const references: Array<{
      acceptanceCriterionId: unknown;
      acceptanceCriterionRevisionId: unknown;
      key: string;
      priority: AcceptanceCriterionInput['priority'];
    }> = [];
    for (const input of inputs) {
      const normalized = this.normalize(input);
      let criterion = await this.criterionModel.findOne(
        {
          workspaceId,
          storyContractId,
          key: normalized.key,
        },
        null,
        { session },
      );
      if (!criterion) {
        [criterion] = await this.criterionModel.create(
          [
            {
              workspaceId,
              storyContractId,
              key: normalized.key,
              lifecycle: 'ACTIVE',
              createdBy: userId,
            },
          ],
          { session },
        );
      }

      const revisionContent = {
        priority: normalized.priority,
        statement: normalized.statement,
        ...(normalized.given ? { given: normalized.given } : {}),
        ...(normalized.when ? { when: normalized.when } : {}),
        ...(normalized.then ? { then: normalized.then } : {}),
        verificationMethod: normalized.verificationMethod,
      };
      const contentHash = createStoryContentHash(revisionContent);
      const previous = await this.revisionModel
        .findOne(
          {
            workspaceId,
            storyContractId,
            acceptanceCriterionId: criterion._id,
          },
          null,
          { session },
        )
        .sort({ revisionNumber: -1 });
      let revision = previous;
      if (!previous || previous.contentHash !== contentHash) {
        [revision] = await this.revisionModel.create(
          [
            {
              workspaceId,
              storyContractId,
              acceptanceCriterionId: criterion._id,
              revisionNumber: (previous?.revisionNumber ?? 0) + 1,
              ...revisionContent,
              contentHash,
              createdBy: userId,
            },
          ],
          { session },
        );
      }
      references.push({
        acceptanceCriterionId: criterion._id,
        acceptanceCriterionRevisionId: revision._id,
        key: normalized.key,
        priority: normalized.priority,
      });
    }
    return references;
  }

  async findById(
    workspaceId: string,
    storyContractId: string,
    criterionId: string,
  ) {
    const criterion = await this.criterionModel.findOne({
      _id: criterionId,
      workspaceId,
      storyContractId,
    });
    if (!criterion) {
      throw new NotFoundException('Acceptance criterion not found');
    }
    return criterion;
  }

  async findRevisions(
    workspaceId: string,
    storyContractId: string,
    criterionId: string,
  ) {
    await this.findById(workspaceId, storyContractId, criterionId);
    return this.revisionModel
      .find({
        workspaceId,
        storyContractId,
        acceptanceCriterionId: criterionId,
      })
      .sort({ revisionNumber: 1 });
  }

  private normalize(input: AcceptanceCriterionInput) {
    return {
      key: input.key.trim(),
      priority: input.priority,
      statement: input.statement.trim(),
      given: input.given?.trim(),
      when: input.when?.trim(),
      then: input.then?.trim(),
      verificationMethod: input.verificationMethod.trim(),
    };
  }
}
