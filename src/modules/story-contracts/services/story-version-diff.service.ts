import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { canonicalStringify } from '../utils/story-content-hash.util';

type ImpactLevel = 'BLOCKING' | 'REVIEW_REQUIRED' | 'INFORMATIONAL';
type ChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export type StructuredStoryChange = {
  changeType: ChangeType;
  entityId: string;
  oldRevisionId?: string;
  newRevisionId?: string;
  impactLevel: ImpactLevel;
};

type StoryVersionSnapshot = {
  _id: unknown;
  workspaceId: unknown;
  storyContractId: unknown;
  contentHash: string;
  contentSnapshot?: Record<string, unknown>;
  requirementLinkSnapshot?: unknown[];
  criteria?: unknown[];
  decisionRecordIds?: unknown[];
};

type SnapshotEntry = Record<string, unknown>;

const asEntries = (value: unknown): SnapshotEntry[] =>
  Array.isArray(value)
    ? value.map(item =>
        item && typeof item === 'object'
          ? (item as SnapshotEntry)
          : { value: item },
      )
    : [];

const firstId = (entry: SnapshotEntry, keys: string[]): string => {
  for (const key of keys) {
    if (entry[key] != null) return String(entry[key]);
  }
  return String(entry.value);
};

const diffEntries = (
  fromEntries: SnapshotEntry[],
  toEntries: SnapshotEntry[],
  idKeys: string[],
  severity: (from?: SnapshotEntry, to?: SnapshotEntry) => ImpactLevel,
  revisionKey?: string,
): StructuredStoryChange[] => {
  const fromById = new Map(
    fromEntries.map(entry => [firstId(entry, idKeys), entry]),
  );
  const toById = new Map(
    toEntries.map(entry => [firstId(entry, idKeys), entry]),
  );
  return [...new Set([...fromById.keys(), ...toById.keys()])]
    .sort()
    .flatMap(entityId => {
      const from = fromById.get(entityId);
      const to = toById.get(entityId);
      if (from && to && canonicalStringify(from) === canonicalStringify(to)) {
        return [];
      }
      const changeType: ChangeType = !from
        ? 'ADDED'
        : !to
          ? 'REMOVED'
          : 'MODIFIED';
      const revisions =
        revisionKey && changeType === 'MODIFIED'
          ? {
              oldRevisionId: String(from?.[revisionKey]),
              newRevisionId: String(to?.[revisionKey]),
            }
          : {};
      return [
        {
          changeType,
          entityId,
          ...revisions,
          impactLevel: severity(from, to),
        },
      ];
    });
};

const priorityImpact = (
  from?: SnapshotEntry,
  to?: SnapshotEntry,
): ImpactLevel => {
  const priorities = [from?.priority, to?.priority];
  if (priorities.includes('MUST')) return 'BLOCKING';
  if (priorities.includes('SHOULD')) return 'REVIEW_REQUIRED';
  return 'INFORMATIONAL';
};

const requirementImpact = (
  from?: SnapshotEntry,
  to?: SnapshotEntry,
): ImpactLevel =>
  [from?.relationship, to?.relationship].some(
    role => role === 'PRIMARY' || role === 'CONSTRAINT',
  )
    ? 'BLOCKING'
    : 'REVIEW_REQUIRED';

const diffScope = (
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): StructuredStoryChange[] => {
  const structuredKeys = new Set([
    'businessRules',
    'permissionRequirements',
    'dependencies',
  ]);
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter(key => !structuredKeys.has(key))
    .sort()
    .flatMap(key => {
      if (canonicalStringify(from[key]) === canonicalStringify(to[key])) {
        return [];
      }
      if (Array.isArray(from[key]) || Array.isArray(to[key])) {
        return diffEntries(
          asEntries(from[key]),
          asEntries(to[key]),
          ['id', '_id', 'key', 'value'],
          () => 'INFORMATIONAL',
        ).map(change => ({ ...change, entityId: `${key}:${change.entityId}` }));
      }
      return [
        {
          changeType:
            from[key] === undefined
              ? ('ADDED' as const)
              : to[key] === undefined
                ? ('REMOVED' as const)
                : ('MODIFIED' as const),
          entityId: key,
          impactLevel: 'INFORMATIONAL' as const,
        },
      ];
    });
};

export const computeStoryVersionChangeSet = (
  from: StoryVersionSnapshot,
  to: StoryVersionSnapshot,
) => {
  const fromContent = from.contentSnapshot ?? {};
  const toContent = to.contentSnapshot ?? {};
  return {
    workspaceId: String(to.workspaceId),
    storyContractId: String(to.storyContractId),
    fromStoryVersionId: String(from._id),
    toStoryVersionId: String(to._id),
    fromContentHash: from.contentHash,
    toContentHash: to.contentHash,
    scopeChanges: diffScope(fromContent, toContent),
    businessRuleChanges: diffEntries(
      asEntries(fromContent.businessRules),
      asEntries(toContent.businessRules),
      ['id', '_id', 'key'],
      () => 'REVIEW_REQUIRED',
    ),
    permissionChanges: diffEntries(
      asEntries(fromContent.permissionRequirements),
      asEntries(toContent.permissionRequirements),
      ['id', '_id', 'key'],
      () => 'REVIEW_REQUIRED',
    ),
    requirementChanges: diffEntries(
      asEntries(from.requirementLinkSnapshot),
      asEntries(to.requirementLinkSnapshot),
      ['requirementId'],
      requirementImpact,
    ),
    acceptanceCriterionChanges: diffEntries(
      asEntries(from.criteria),
      asEntries(to.criteria),
      ['acceptanceCriterionId', 'criterionId'],
      priorityImpact,
      'acceptanceCriterionRevisionId',
    ),
    decisionChanges: diffEntries(
      asEntries(from.decisionRecordIds),
      asEntries(to.decisionRecordIds),
      ['decisionRecordId', 'id', '_id', 'value'],
      () => 'REVIEW_REQUIRED',
    ),
    dependencyChanges: diffEntries(
      asEntries(fromContent.dependencies),
      asEntries(toContent.dependencies),
      ['id', '_id', 'key'],
      () => 'REVIEW_REQUIRED',
    ),
  };
};

@Injectable()
export class StoryVersionDiffService {
  constructor(
    @InjectModel('StoryVersion') private readonly versionModel: Model<any>,
    @InjectModel('StoryVersionChangeSet')
    private readonly changeSetModel: Model<any>,
  ) {}

  async compare(
    workspaceId: string,
    storyContractId: string,
    fromStoryVersionId: string,
    toStoryVersionId: string,
  ) {
    return this.persist(
      workspaceId,
      storyContractId,
      fromStoryVersionId,
      toStoryVersionId,
    );
  }

  async persist(
    workspaceId: string,
    storyContractId: string,
    fromStoryVersionId: string,
    toStoryVersionId: string,
    session?: ClientSession,
  ) {
    const [from, to] = await Promise.all(
      [fromStoryVersionId, toStoryVersionId].map(_id => {
        const query = { _id, workspaceId, storyContractId };
        return session
          ? this.versionModel.findOne(query, null, { session })
          : this.versionModel.findOne(query);
      }),
    );
    if (!from || !to) {
      throw new NotFoundException('Story version not found');
    }
    const changeSet = computeStoryVersionChangeSet(from, to);
    return this.changeSetModel.findOneAndUpdate(
      {
        workspaceId,
        storyContractId,
        fromStoryVersionId,
        toStoryVersionId,
      },
      { $setOnInsert: changeSet },
      { new: true, upsert: true, ...(session ? { session } : {}) },
    );
  }
}
