import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { DecisionService } from './decision.service';
import { StoryAuthorizationService } from './story-authorization.service';

describe('DecisionService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const proposalId = new Types.ObjectId().toString();
  const decisionRecordId = new Types.ObjectId().toString();
  const human = {
    kind: 'human' as const,
    userId: new Types.ObjectId().toString(),
    permissions: [
      WORKSPACE_PERMISSIONS.DECISION_PROPOSE,
      WORKSPACE_PERMISSIONS.DECISION_APPROVE,
    ],
  };
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const proposalModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  };
  const recordModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const contractModel = { findOne: jest.fn() };
  const workspaceModel = { findOne: jest.fn() };
  const connection = { startSession: jest.fn() };
  const events = { emit: jest.fn() };
  let service: DecisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: human.userId,
      members: [],
      status: 'active',
    });
    service = new DecisionService(
      proposalModel as any,
      recordModel as any,
      contractModel as any,
      workspaceModel as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );
  });

  it('lists every proposal in deterministic creation order within its Workspace and Contract', async () => {
    const proposals = [
      { _id: proposalId, state: 'OPEN' },
      { _id: new Types.ObjectId(), state: 'APPROVED' },
    ];
    const sort = jest.fn().mockResolvedValue(proposals);
    proposalModel.find.mockReturnValue({ sort });

    await expect(
      service.findProposals(workspaceId, storyContractId),
    ).resolves.toEqual(proposals);

    expect(contractModel.findOne).toHaveBeenCalledWith(
      { _id: storyContractId, workspaceId },
      null,
      undefined,
    );
    expect(proposalModel.find).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('returns the same safe not-found before querying proposals for a Contract outside the Workspace', async () => {
    contractModel.findOne.mockResolvedValue(null);

    await expect(
      service.findProposals(workspaceId, storyContractId),
    ).rejects.toEqual(new NotFoundException('Story contract not found'));

    expect(contractModel.findOne).toHaveBeenCalledWith(
      { _id: storyContractId, workspaceId },
      null,
      undefined,
    );
    expect(proposalModel.find).not.toHaveBeenCalled();
  });

  it('revises only an open proposal in its Workspace and Contract', async () => {
    const revised = { _id: proposalId, state: 'OPEN', question: 'Revised?' };
    proposalModel.findOneAndUpdate.mockResolvedValue(revised);

    await expect(
      service.updateProposal(
        workspaceId,
        storyContractId,
        proposalId,
        {
          question: '  Revised? ',
          options: [{ key: 'yes', label: ' Yes ' }],
          recommendation: ' yes ',
        },
        human,
      ),
    ).resolves.toEqual(revised);

    expect(proposalModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: proposalId,
        workspaceId,
        storyContractId,
        state: 'OPEN',
      },
      {
        $set: {
          question: 'Revised?',
          options: [{ key: 'yes', label: 'Yes' }],
          recommendation: 'yes',
        },
      },
      { new: true },
    );
  });

  it('creates a normalized human proposal without an optional recommendation', async () => {
    const proposal = { _id: proposalId, state: 'OPEN' };
    proposalModel.create.mockResolvedValue([proposal]);

    await expect(
      service.createProposal(
        workspaceId,
        storyContractId,
        {
          question: '  Which provider? ',
          options: [{ key: ' stripe ', label: ' Stripe ' }],
        },
        human,
      ),
    ).resolves.toEqual(proposal);

    expect(proposalModel.create).toHaveBeenCalledWith([
      expect.objectContaining({
        question: 'Which provider?',
        options: [{ key: 'stripe', label: 'Stripe' }],
        proposedBy: { kind: 'human', actorId: human.userId },
      }),
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      'decision.proposed',
      expect.objectContaining({
        data: expect.objectContaining({ actorId: human.userId }),
      }),
    );
  });

  it('records the proposing agent identity in both persistence and the event', async () => {
    const proposal = { _id: proposalId, state: 'OPEN' };
    const agent = {
      kind: 'agent' as const,
      agentId: 'agent-1',
      memberPermissions: [WORKSPACE_PERMISSIONS.DECISION_PROPOSE],
      tokenScopes: [WORKSPACE_PERMISSIONS.DECISION_PROPOSE],
    };
    proposalModel.create.mockResolvedValue([proposal]);

    await service.createProposal(
      workspaceId,
      storyContractId,
      {
        question: 'Which provider?',
        options: [{ key: 'stripe', label: 'Stripe' }],
      },
      agent,
    );

    expect(proposalModel.create).toHaveBeenCalledWith([
      expect.objectContaining({
        proposedBy: { kind: 'agent', actorId: agent.agentId },
      }),
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      'decision.proposed',
      expect.objectContaining({
        data: expect.objectContaining({ actorId: agent.agentId }),
      }),
    );
  });

  it('returns safe not-found when an open proposal cannot be revised', async () => {
    proposalModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.updateProposal(
        workspaceId,
        storyContractId,
        proposalId,
        {
          question: 'Revised?',
          options: [{ key: 'yes', label: 'Yes' }],
        },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Decision proposal not found'));
  });

  it('approves a scoped proposal by inserting an immutable DecisionRecord', async () => {
    const proposal = {
      _id: proposalId,
      question: 'Use Mongo?',
      options: [
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ],
      state: 'OPEN',
    };
    const record = { _id: decisionRecordId, selectedOption: 'yes' };
    proposalModel.findOne.mockResolvedValue(proposal);
    recordModel.create.mockResolvedValue([record]);
    proposalModel.findOneAndUpdate.mockResolvedValue({
      ...proposal,
      state: 'APPROVED',
    });

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: ' Existing stack ' },
        human,
      ),
    ).resolves.toEqual(record);

    expect(recordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          sourceProposalId: proposalId,
          question: 'Use Mongo?',
          selectedOption: 'yes',
          rationale: 'Existing stack',
          decidedBy: human.userId,
        }),
      ],
      { session },
    );
    expect(proposalModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: proposalId,
        workspaceId,
        storyContractId,
        state: 'OPEN',
      },
      {
        $set: expect.objectContaining({
          state: 'APPROVED',
          resolvedBy: human.userId,
        }),
      },
      { new: true, session },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'decision.record.approved',
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          aggregateId: storyContractId,
          decisionRecordId,
        }),
      }),
    );
    expect(session.withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('does not publish an approval event when the transaction fails', async () => {
    proposalModel.findOne.mockResolvedValue({
      _id: proposalId,
      question: 'Use Mongo?',
      options: [{ key: 'yes', label: 'Yes' }],
      state: 'OPEN',
    });
    recordModel.create.mockRejectedValue(new Error('insert failed'));

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toThrow('insert failed');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('returns safe not-found when approval cannot resolve an open proposal', async () => {
    proposalModel.findOne.mockResolvedValue(null);

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Decision proposal not found'));
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('rejects an approval option that was never proposed', async () => {
    proposalModel.findOne.mockResolvedValue({
      _id: proposalId,
      options: [{ key: 'yes', label: 'Yes' }],
      state: 'OPEN',
    });

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'no', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toEqual(
      new BadRequestException('Selected decision option is invalid'),
    );
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('returns safe not-found when approval workspace membership disappears', async () => {
    workspaceModel.findOne.mockResolvedValue(null);

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Workspace not found'));
    expect(contractModel.findOne).not.toHaveBeenCalled();
  });

  it('returns safe not-found when the active Contract disappears', async () => {
    contractModel.findOne.mockResolvedValue(null);

    await expect(
      service.createProposal(
        workspaceId,
        storyContractId,
        {
          question: 'Which provider?',
          options: [{ key: 'stripe', label: 'Stripe' }],
        },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Story contract not found'));
    expect(proposalModel.create).not.toHaveBeenCalled();
  });

  it('rejects approval by an agent even when its scopes request approval', async () => {
    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        {
          kind: 'agent',
          agentId: 'agent-1',
          memberPermissions: [WORKSPACE_PERMISSIONS.DECISION_APPROVE],
          tokenScopes: [WORKSPACE_PERMISSIONS.DECISION_APPROVE],
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_PERMISSION_REQUIRED' },
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('revalidates human approval against fresh Workspace membership', async () => {
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: new Types.ObjectId(),
      members: [{ userId: human.userId, role: 'member' }],
      status: 'active',
    });

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_PERMISSION_REQUIRED' },
    });
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('inserts a superseding DecisionRecord without updating prior history', async () => {
    const prior = {
      _id: decisionRecordId,
      sourceProposalId: proposalId,
      question: 'Use Mongo?',
    };
    const replacement = {
      _id: new Types.ObjectId(),
      supersedesDecisionRecordId: decisionRecordId,
    };
    recordModel.findOne.mockResolvedValue(prior);
    proposalModel.findOne.mockResolvedValue({
      _id: proposalId,
      options: [{ key: 'no', label: 'No' }],
    });
    recordModel.create.mockResolvedValue([replacement]);

    await expect(
      service.supersede(
        workspaceId,
        storyContractId,
        decisionRecordId,
        { selectedOption: 'no', rationale: 'New evidence' },
        human,
      ),
    ).resolves.toEqual(replacement);

    expect(recordModel.findOne).toHaveBeenCalledWith(
      {
        _id: decisionRecordId,
        workspaceId,
        storyContractId,
      },
      null,
      { session },
    );
    expect(recordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          sourceProposalId: proposalId,
          question: 'Use Mongo?',
          selectedOption: 'no',
          rationale: 'New evidence',
          supersedesDecisionRecordId: decisionRecordId,
          decidedBy: human.userId,
        }),
      ],
      { session },
    );
    expect((recordModel as any).findOneAndUpdate).toBeUndefined();
  });

  it('rejects a superseding option that was never proposed', async () => {
    recordModel.findOne.mockResolvedValue({
      _id: decisionRecordId,
      sourceProposalId: proposalId,
      question: 'Use Mongo?',
    });
    proposalModel.findOne.mockResolvedValue({
      _id: proposalId,
      options: [{ key: 'yes', label: 'Yes' }],
    });

    await expect(
      service.supersede(
        workspaceId,
        storyContractId,
        decisionRecordId,
        { selectedOption: 'no', rationale: 'New evidence' },
        human,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Selected decision option is invalid' },
    });
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('returns safe not-found when a superseded record has no source proposal', async () => {
    recordModel.findOne.mockResolvedValue({
      _id: decisionRecordId,
      sourceProposalId: proposalId,
      question: 'Use Mongo?',
    });
    proposalModel.findOne.mockResolvedValue(null);

    await expect(
      service.supersede(
        workspaceId,
        storyContractId,
        decisionRecordId,
        { selectedOption: 'no', rationale: 'New evidence' },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Decision proposal not found'));
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('returns safe not-found for a Decision ID under the wrong Contract', async () => {
    recordModel.findOne.mockResolvedValue(null);

    await expect(
      service.supersede(
        workspaceId,
        storyContractId,
        decisionRecordId,
        { selectedOption: 'no', rationale: 'New evidence' },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Decision record not found'));

    expect(recordModel.findOne).toHaveBeenCalledWith(
      {
        _id: decisionRecordId,
        workspaceId,
        storyContractId,
      },
      null,
      { session },
    );
  });

  it('fails proposal approval if another resolution wins the race', async () => {
    proposalModel.findOne.mockResolvedValue({
      _id: proposalId,
      question: 'Use Mongo?',
      options: [{ key: 'yes', label: 'Yes' }],
      state: 'OPEN',
    });
    recordModel.create.mockResolvedValue([{ _id: decisionRecordId }]);
    proposalModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.approveProposal(
        workspaceId,
        storyContractId,
        proposalId,
        { selectedOption: 'yes', rationale: 'Existing stack' },
        human,
      ),
    ).rejects.toEqual(
      new ConflictException({
        code: 'DECISION_PROPOSAL_CONFLICT',
        message: 'DECISION_PROPOSAL_CONFLICT',
      }),
    );
    expect(events.emit).not.toHaveBeenCalled();
  });
});
