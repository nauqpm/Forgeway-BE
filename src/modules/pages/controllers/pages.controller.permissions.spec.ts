import { GUARDS_METADATA } from '@nestjs/common/constants';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../../common/guards/workspace-role.guard';
import { PagesController } from './pages.controller';

const prototype = PagesController.prototype;

const pageViewRoutes = [
  'findAll',
  'findById',
  'findBySlug',
  'findByWorkspace',
  'findRootPages',
  'findChildren',
  'getVersions',
  'getVersionById',
] as const;

const pageEditRoutes = ['exportDocx', 'importDocx'] as const;

describe('PagesController workspace permissions', () => {
  it.each(pageViewRoutes)(
    '%s requires WorkspaceRoleGuard and PAGE_VIEW',
    methodName => {
      const handler = prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        WorkspaceRoleGuard,
      );
      expect(
        Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, handler),
      ).toEqual([WORKSPACE_PERMISSIONS.PAGE_VIEW]);
    },
  );

  it.each(pageEditRoutes)(
    '%s requires WorkspaceRoleGuard and PAGE_EDIT',
    methodName => {
      const handler = prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        WorkspaceRoleGuard,
      );
      expect(
        Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, handler),
      ).toEqual([WORKSPACE_PERMISSIONS.PAGE_EDIT]);
    },
  );
});
