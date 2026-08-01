import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import {
  ApproveStoryVersionDto,
  CreateStoryContractDto,
  CreateDecisionProposalDto,
  CreateCriterionVerificationDto,
  DecisionResolutionDto,
  RejectStoryVersionDto,
  UpdateStoryDraftDto,
} from './story-contract.dto';

describe('Story contract DTOs', () => {
  it('rejects blank contract titles and invalid primary requirement ids', async () => {
    const dto = plainToInstance(CreateStoryContractDto, {
      title: '   ',
      primaryRequirementId: 'not-an-id',
    });

    const errors = await validate(dto);
    expect(dto.title).toBe('');
    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining(['title', 'primaryRequirementId']),
    );
  });

  it('requires a positive expected revision for draft updates', async () => {
    const errors = await validate(
      plainToInstance(UpdateStoryDraftDto, { expectedDraftRevision: 0 }),
    );
    expect(errors.map(error => error.property)).toContain(
      'expectedDraftRevision',
    );
  });

  it('validates mutable draft field shapes and decision ids', async () => {
    const errors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        content: 'not-an-object',
        criterionInputs: {},
        decisionProposalIds: ['not-an-id'],
      }),
    );

    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining([
        'content',
        'criterionInputs',
        'decisionProposalIds',
      ]),
    );
  });

  it('validates scoped requirement link ids, roles and duplicate references', async () => {
    const requirementId = new Types.ObjectId().toString();
    const errors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        requirementLinks: [
          { requirementId, role: 'PRIMARY' },
          { requirementId, role: 'UNSUPPORTED' },
        ],
      }),
    );

    expect(errors.map(error => error.property)).toContain('requirementLinks');
  });

  it('accepts one primary plus secondary requirement links', async () => {
    const dto = plainToInstance(UpdateStoryDraftDto, {
      expectedDraftRevision: 1,
      requirementLinks: [
        {
          requirementId: new Types.ObjectId().toString(),
          role: 'PRIMARY',
          evidenceNote: '  source  ',
        },
        {
          requirementId: new Types.ObjectId().toString(),
          role: 'SUPPORTING',
        },
      ],
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.requirementLinks?.[0].evidenceNote).toBe('source');
  });

  it('rejects null mutable object and collection fields', async () => {
    const errors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        content: null,
        requirementLinks: null,
        criterionInputs: null,
        decisionProposalIds: null,
      }),
    );

    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining([
        'content',
        'requirementLinks',
        'criterionInputs',
        'decisionProposalIds',
      ]),
    );
  });

  it('allows empty mutable object and collection fields', async () => {
    const errors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        content: {},
        criterionInputs: [],
        decisionProposalIds: [],
      }),
    );

    expect(errors).toEqual([]);
  });

  it('validates decision proposal questions and options at the boundary', async () => {
    const errors = await validate(
      plainToInstance(CreateDecisionProposalDto, {
        question: '   ',
        options: [{ key: ' ', label: '' }],
      }),
    );

    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining(['question', 'options']),
    );
  });

  it('rejects blank decision resolutions', async () => {
    const errors = await validate(
      plainToInstance(DecisionResolutionDto, {
        selectedOption: ' ',
        rationale: ' ',
      }),
    );

    expect(errors.map(error => error.property)).toEqual([
      'selectedOption',
      'rationale',
    ]);
  });

  it('accepts a null expected pointer but requires an approval request id', async () => {
    const errors = await validate(
      plainToInstance(ApproveStoryVersionDto, {
        approvalRequestId: 'not-an-id',
        expectedCurrentVersionId: null,
      }),
    );

    expect(errors.map(error => error.property)).toEqual(['approvalRequestId']);
  });

  it('rejects a blank rejection reason when one is supplied', async () => {
    const errors = await validate(
      plainToInstance(RejectStoryVersionDto, {
        approvalRequestId: new Types.ObjectId().toString(),
        reason: '   ',
      }),
    );

    expect(errors.map(error => error.property)).toEqual(['reason']);
  });

  it('validates criterion verification status, evidence and optional Task id', async () => {
    const errors = await validate(
      plainToInstance(CreateCriterionVerificationDto, {
        storyVersionId: 'not-an-id',
        status: 'UNKNOWN',
        evidenceType: ' ',
        evidenceRef: '',
        taskId: 'not-an-id',
        pullRequestRef: ' ',
        qaRunRef: ' ',
      }),
    );

    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining([
        'storyVersionId',
        'status',
        'evidenceType',
        'evidenceRef',
        'taskId',
        'pullRequestRef',
        'qaRunRef',
      ]),
    );
  });

  it('accepts opaque PR and QA evidence references', async () => {
    const errors = await validate(
      plainToInstance(CreateCriterionVerificationDto, {
        storyVersionId: new Types.ObjectId().toString(),
        status: 'INCONCLUSIVE',
        evidenceType: 'manual',
        evidenceRef: 'artifact:anything',
        pullRequestRef: 'provider-specific:pull/42',
        qaRunRef: 'qa-vendor|run|alpha',
      }),
    );

    expect(errors).toEqual([]);
  });

  it('rejects oversized Story and verification text at the DTO boundary', async () => {
    const contractErrors = await validate(
      plainToInstance(CreateStoryContractDto, {
        title: 'x'.repeat(256),
        primaryRequirementId: new Types.ObjectId().toString(),
      }),
    );
    const verificationErrors = await validate(
      plainToInstance(CreateCriterionVerificationDto, {
        storyVersionId: new Types.ObjectId().toString(),
        status: 'PASSED',
        evidenceType: 'manual',
        evidenceRef: 'x'.repeat(2_001),
      }),
    );

    expect(contractErrors.map(error => error.property)).toContain('title');
    expect(verificationErrors.map(error => error.property)).toContain(
      'evidenceRef',
    );
  });

  it('rejects invalid nested criterion enums and oversized Draft content', async () => {
    const criterionErrors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        criterionInputs: [
          {
            key: 'AC-1',
            priority: 'INVALID',
            statement: 'Works',
            verificationMethod: 'Test',
          },
        ],
      }),
    );
    const contentErrors = await validate(
      plainToInstance(UpdateStoryDraftDto, {
        expectedDraftRevision: 1,
        content: { body: 'x'.repeat(100_001) },
      }),
    );

    expect(criterionErrors.map(error => error.property)).toContain(
      'criterionInputs',
    );
    expect(contentErrors.map(error => error.property)).toContain('content');
  });
});
