import { Mongoose } from 'mongoose';
import { WorkspaceSchema } from '../../workspaces/schemas/workspace.schema';
import { StoryApprovalPolicySchema } from './approval-policy.schema';

describe('StoryApprovalPolicySchema', () => {
  it('uses the approved unconfigured Workspace policy baseline', () => {
    const mongoose = new Mongoose();
    const Policy = mongoose.model(
      'StoryApprovalPolicyDefaultsSpec',
      StoryApprovalPolicySchema.clone(),
    );

    const policy = new Policy();

    expect(policy.minimumApprovals).toBe(1);
    expect(policy.allowAuthorApproval).toBe(true);
    expect(policy.requireIndependentApproval).toBe(false);
  });

  it('persists typed Workspace policy defaults and validates malformed values', async () => {
    const mongoose = new Mongoose();
    const Workspace = mongoose.model(
      'WorkspaceApprovalPolicySpec',
      WorkspaceSchema.clone(),
    );
    const base = {
      name: 'Workspace',
      slug: 'workspace',
      key: 'WORK',
      ownerId: new mongoose.Types.ObjectId(),
    };

    const workspace = new Workspace(base);
    expect(workspace.storyApprovalPolicy).toMatchObject({
      minimumApprovals: 1,
      allowAuthorApproval: true,
      requireIndependentApproval: false,
    });

    const invalid = new Workspace({
      ...base,
      storyApprovalPolicy: {
        minimumApprovals: 0,
        allowAuthorApproval: true,
        requireIndependentApproval: false,
      },
    });
    await expect(invalid.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        'storyApprovalPolicy.minimumApprovals': expect.anything(),
      }),
    });
  });
});
