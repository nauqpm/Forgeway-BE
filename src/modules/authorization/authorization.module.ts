import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import { AuthorizationResolverService } from './authorization-resolver.service';
import {
  AuthorizationDivergenceLogger,
  AuthorizationMetrics,
} from './authorization-observability.service';
import { AuthorizationService } from './authorization.service';
import { LegacyAuthorizationAdapterService } from './legacy-authorization-adapter.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  providers: [
    LegacyAuthorizationAdapterService,
    AuthorizationResolverService,
    AuthorizationDivergenceLogger,
    AuthorizationMetrics,
    {
      provide: AuthorizationService,
      inject: [
        LegacyAuthorizationAdapterService,
        AuthorizationResolverService,
        AuthorizationDivergenceLogger,
        AuthorizationMetrics,
        ConfigService,
      ],
      useFactory: (
        legacyAdapter: LegacyAuthorizationAdapterService,
        resolver: AuthorizationResolverService,
        divergenceLogger: AuthorizationDivergenceLogger,
        metrics: AuthorizationMetrics,
        config: ConfigService,
      ) =>
        new AuthorizationService(
          legacyAdapter,
          resolver,
          divergenceLogger,
          metrics,
          config.get<string>('AUTHORIZATION_MODE'),
        ),
    },
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
