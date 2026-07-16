import { Inject, Injectable } from '@nestjs/common';
import {
  AuthorizationMode,
  parseAuthorizationMode,
} from './authorization.constants';
import { AuthorizationResolverService } from './authorization-resolver.service';
import {
  AuthorizationDivergenceLogger,
  AuthorizationDivergenceReporter,
  AuthorizationMetrics,
  AuthorizationMetricsRecorder,
} from './authorization-observability.service';
import { LegacyAuthorizationAdapterService } from './legacy-authorization-adapter.service';
import {
  AuthorizationRequest,
  AuthorizationResult,
  LegacyAuthorizationAdapter,
} from './authorization.types';

interface AuthorizationResolver {
  authorize(request: AuthorizationRequest): Promise<AuthorizationResult>;
}

@Injectable()
export class AuthorizationService {
  private readonly mode: AuthorizationMode;

  constructor(
    @Inject(LegacyAuthorizationAdapterService)
    private readonly legacyAdapter: LegacyAuthorizationAdapter,
    @Inject(AuthorizationResolverService)
    private readonly resolver: AuthorizationResolver,
    @Inject(AuthorizationDivergenceLogger)
    private readonly divergenceLogger: AuthorizationDivergenceReporter,
    @Inject(AuthorizationMetrics)
    private readonly metrics: AuthorizationMetricsRecorder,
    mode?: string,
  ) {
    this.mode = parseAuthorizationMode(mode);
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    if (this.mode === 'enforce') {
      return this.record(await this.resolver.authorize(request), request);
    }

    const legacy = await this.legacyAdapter.authorize(request);
    if (this.mode === 'legacy') return this.record(legacy, request);

    const startedAt = Date.now();
    try {
      const resolved = await this.resolver.authorize(request);
      this.metrics.resolverLatency({
        mode: this.mode,
        permission: request.permission,
        resourceType: request.resource.type,
        ms: Date.now() - startedAt,
      });

      if (legacy.decision !== resolved.decision) {
        this.divergenceLogger.divergence({
          request,
          legacy,
          resolver: resolved,
          mode: this.mode,
        });
        this.metrics.divergence({
          mode: this.mode,
          permission: request.permission,
          resourceType: request.resource.type,
          decision: legacy.decision,
        });
      }
    } catch (error) {
      this.divergenceLogger.shadowError({ request, mode: this.mode, error });
      this.metrics.shadowError({
        mode: this.mode,
        permission: request.permission,
        resourceType: request.resource.type,
      });
    }

    return this.record(legacy, request);
  }

  private record(
    result: AuthorizationResult,
    request: AuthorizationRequest,
  ): AuthorizationResult {
    this.metrics.decision({
      mode: this.mode,
      permission: request.permission,
      resourceType: request.resource.type,
      decision: result.decision,
    });
    return result;
  }
}
