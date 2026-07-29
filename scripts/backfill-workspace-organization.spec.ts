const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockStartSession = jest.fn();
const mockApply = jest.fn();
let mockDb: any;

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    __esModule: true,
    default: {
      connect: mockConnect,
      disconnect: mockDisconnect,
      startSession: mockStartSession,
      connection: {
        get db() {
          return mockDb;
        },
      },
    },
  };
});

jest.mock(
  '../src/modules/workspaces/services/workspace-organization-backfill-apply.service',
  () => ({
    WorkspaceOrganizationBackfillApplyService: jest
      .fn()
      .mockImplementation(() => ({ apply: mockApply })),
  }),
);

type ApplyReport = {
  status: 'success' | 'completed_with_conflicts';
  createdOrganizations: number;
  createdMemberships: number;
  reusedMemberships: number;
  updatedWorkspaces: number;
  alreadyBoundWorkspaces: number;
  conflicts: { code: string; workspaceId?: string }[];
};

const configuredOwnerId = '507f1f77bcf86cd799439001';
const missingUserConflicts = [
  {
    code: 'MISSING_USER',
    workspaceId: '507f1f77bcf86cd799439101',
    userId: '507f1f77bcf86cd799439202',
  },
  {
    code: 'MISSING_USER',
    workspaceId: '507f1f77bcf86cd799439102',
    userId: '507f1f77bcf86cd799439203',
  },
];

async function runApplyWithReport(applyReport: ApplyReport) {
  jest.resetModules();
  mockApply.mockReset().mockResolvedValue(applyReport);
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockStartSession.mockReset().mockResolvedValue({
    withTransaction: async (operation: () => Promise<unknown>) => operation(),
    endSession: jest.fn().mockResolvedValue(undefined),
  });

  const { Types } = jest.requireActual('mongoose');
  const objectId = (value: string) => new Types.ObjectId(value);
  const workspaces = [
    {
      _id: objectId(missingUserConflicts[0].workspaceId),
      organizationId: null,
      ownerId: objectId('507f1f77bcf86cd799439201'),
      members: [{ userId: objectId(missingUserConflicts[0].userId) }],
    },
    {
      _id: objectId(missingUserConflicts[1].workspaceId),
      organizationId: null,
      ownerId: objectId(missingUserConflicts[1].userId),
      members: [],
    },
    {
      _id: objectId('507f1f77bcf86cd799439103'),
      organizationId: null,
      ownerId: objectId('507f1f77bcf86cd799439204'),
      members: [{ userId: objectId('507f1f77bcf86cd799439205') }],
    },
  ];
  const activeUserIds = [
    configuredOwnerId,
    '507f1f77bcf86cd799439201',
    '507f1f77bcf86cd799439204',
    '507f1f77bcf86cd799439205',
  ].map(objectId);
  const workspaceCursor: any = {
    batchSize: jest.fn(() => workspaceCursor),
    async *[Symbol.asyncIterator]() {
      yield* workspaces;
    },
  };

  mockDb = {
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return {
          findOne: jest.fn().mockResolvedValue({
            _id: objectId(configuredOwnerId),
            status: 'active',
          }),
          find: jest.fn(() => ({
            toArray: jest
              .fn()
              .mockResolvedValue(
                activeUserIds.map((_id: unknown) => ({ _id })),
              ),
          })),
        };
      }
      if (name === 'organizations') {
        return {
          findOne: jest.fn().mockResolvedValue({
            _id: objectId('507f1f77bcf86cd799439301'),
            slug: 'legacy-organization',
            status: 'active',
            deletedAt: null,
          }),
        };
      }
      if (name === 'workspaces') {
        return { find: jest.fn(() => workspaceCursor) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };

  const originalArgv = process.argv;
  const originalEnv = {
    DB_CONNECTION_STRING: process.env.DB_CONNECTION_STRING,
    LEGACY_ORGANIZATION_OWNER_USER_ID:
      process.env.LEGACY_ORGANIZATION_OWNER_USER_ID,
  };
  const originalExitCode = process.exitCode;
  process.argv = [originalArgv[0], originalArgv[1], 'apply', '--confirm'];
  process.env.DB_CONNECTION_STRING = 'mongodb://unit-test/pr4-report';
  process.env.LEGACY_ORGANIZATION_OWNER_USER_ID = configuredOwnerId;
  process.exitCode = undefined;

  let resolveReport!: (report: any) => void;
  let rejectReport!: (error: unknown) => void;
  const reportPromise = new Promise<any>((resolve, reject) => {
    resolveReport = resolve;
    rejectReport = reject;
  });
  const log = jest.spyOn(console, 'log').mockImplementation(value => {
    try {
      resolveReport(JSON.parse(String(value)));
    } catch (error) {
      rejectReport(error);
    }
  });

  try {
    await jest.isolateModulesAsync(async () => {
      await import('./backfill-workspace-organization');
    });
    return await reportPromise;
  } finally {
    log.mockRestore();
    process.argv = originalArgv;
    process.env.DB_CONNECTION_STRING = originalEnv.DB_CONNECTION_STRING;
    process.env.LEGACY_ORGANIZATION_OWNER_USER_ID =
      originalEnv.LEGACY_ORGANIZATION_OWNER_USER_ID;
    process.exitCode = originalExitCode;
  }
}

describe('workspace organization backfill CLI report', () => {
  it('retains every preflight conflict alongside apply-time conflicts', async () => {
    const applyConflict = {
      code: 'WORKSPACE_ALREADY_BOUND_ELSEWHERE',
      workspaceId: '507f1f77bcf86cd799439103',
    };

    const report = await runApplyWithReport({
      status: 'completed_with_conflicts',
      createdOrganizations: 0,
      createdMemberships: 0,
      reusedMemberships: 0,
      updatedWorkspaces: 0,
      alreadyBoundWorkspaces: 0,
      conflicts: [applyConflict],
    });

    expect(report.candidateWorkspaces).toBe(1);
    expect(report.conflicts).toEqual([...missingUserConflicts, applyConflict]);
  });

  it('derives completed_with_conflicts after merging preflight conflicts', async () => {
    const report = await runApplyWithReport({
      status: 'success',
      createdOrganizations: 0,
      createdMemberships: 2,
      reusedMemberships: 0,
      updatedWorkspaces: 1,
      alreadyBoundWorkspaces: 0,
      conflicts: [],
    });

    expect(report.status).toBe('completed_with_conflicts');
    expect(report.conflicts).toEqual(missingUserConflicts);
  });
});
