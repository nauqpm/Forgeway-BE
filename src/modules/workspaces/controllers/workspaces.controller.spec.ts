import { Test, TestingModule } from '@nestjs/testing';

import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from '../services/workspaces.service';
import { WorkspaceMemberService } from '../services/workspace-member.service';
import { WORKSPACE_SAMPLE_AVATARS } from '../constants/workspace-sample-avatars.constant';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

describe('WorkspacesController', () => {
  let controller: WorkspacesController;
  let workspacesService: jest.Mocked<
    Pick<WorkspacesService, 'getAvatarSamples'>
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [
        {
          provide: WorkspacesService,
          useValue: {
            getAvatarSamples: jest.fn(),
          },
        },
        {
          provide: WorkspaceMemberService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WorkspacesController);
    workspacesService = module.get(WorkspacesService);
  });

  it('returns sample workspace avatars from the service', async () => {
    workspacesService.getAvatarSamples.mockReturnValue({
      avatars: WORKSPACE_SAMPLE_AVATARS,
    });

    const result = await controller.getAvatarSamples();

    expect(workspacesService.getAvatarSamples).toHaveBeenCalledTimes(1);
    expect(result.avatars).toHaveLength(25);
    expect(result.avatars[0].publicId).toBe(
      'sdlc-platform/sample avater workspace/viewavatar',
    );
  });
});
