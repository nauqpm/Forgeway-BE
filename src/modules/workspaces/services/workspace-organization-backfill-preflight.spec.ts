import { buildWorkspaceOrganizationPreflight } from './workspace-organization-backfill-preflight';

describe('buildWorkspaceOrganizationPreflight', () => {
  it('reports workspace user conflicts without allowing that workspace to be applied', () => {
    const report = buildWorkspaceOrganizationPreflight({
      configuredOwnerValid: true,
      transactionAvailable: true,
      legacyOrganizationValid: true,
      workspaces: [
        { id: 'good', ownerId: 'owner', memberIds: ['member'] },
        { id: 'bad', ownerId: 'missing', memberIds: [] },
      ],
      activeUserIds: new Set(['owner', 'member']),
    });

    expect(report.blocked).toBe(false);
    expect(report.candidateWorkspaceIds).toEqual(['good']);
    expect(report.conflicts).toEqual([
      { code: 'MISSING_USER', workspaceId: 'bad', userId: 'missing' },
    ]);
  });

  it('blocks globally before mutation when the transaction is unavailable', () => {
    const report = buildWorkspaceOrganizationPreflight({
      configuredOwnerValid: true,
      transactionAvailable: false,
      legacyOrganizationValid: true,
      workspaces: [],
      activeUserIds: new Set(),
    });

    expect(report.blocked).toBe(true);
    expect(report.conflicts[0].code).toBe('TRANSACTION_UNAVAILABLE');
  });
});
