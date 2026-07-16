import { Injectable, Logger } from '@nestjs/common';
import type { AuthorizationMode, Permission } from './authorization.constants';
import type {
  AuthorizationRequest,
  AuthorizationResult,
} from './authorization.types';

type DecisionMetric = {
  mode: AuthorizationMode;
  permission: Permission;
  resourceType: string;
  decision: string;
};

export interface AuthorizationMetricsRecorder {
  decision(metric: DecisionMetric): void;
  divergence(metric: DecisionMetric): void;
  resolverLatency(
    metric: Omit<DecisionMetric, 'decision'> & { ms: number },
  ): void;
  shadowError(metric: Omit<DecisionMetric, 'decision'>): void;
}

export interface AuthorizationDivergenceReporter {
  divergence(input: {
    request: AuthorizationRequest;
    legacy: AuthorizationResult;
    resolver: AuthorizationResult;
    mode: AuthorizationMode;
  }): void;
  shadowError(input: {
    request: AuthorizationRequest;
    mode: AuthorizationMode;
    error: unknown;
  }): void;
}

@Injectable()
export class AuthorizationMetrics implements AuthorizationMetricsRecorder {
  decision(_metric: DecisionMetric): void {}
  divergence(_metric: DecisionMetric): void {}
  resolverLatency(
    _metric: Omit<DecisionMetric, 'decision'> & { ms: number },
  ): void {}
  shadowError(_metric: Omit<DecisionMetric, 'decision'>): void {}
}

@Injectable()
export class AuthorizationDivergenceLogger implements AuthorizationDivergenceReporter {
  private readonly logger = new Logger(AuthorizationDivergenceLogger.name);

  divergence(input: {
    request: AuthorizationRequest;
    legacy: AuthorizationResult;
    resolver: AuthorizationResult;
    mode: AuthorizationMode;
  }): void {
    this.logger.warn(
      JSON.stringify({
        event: 'authorization.divergence',
        authorizationMode: input.mode,
        userId: input.request.userId,
        permission: input.request.permission,
        resourceType: input.request.resource.type,
        resourceId: input.request.resource.id,
        organizationId: input.request.resource.organizationId,
        workspaceId: input.request.resource.workspaceId,
        legacyDecision: input.legacy.decision,
        legacyReasonCode: input.legacy.reasonCode,
        resolverDecision: input.resolver.decision,
        resolverReasonCode: input.resolver.reasonCode,
        matchedRoles: input.resolver.matchedRoles,
        restrictions: input.resolver.restrictions,
      }),
    );
  }

  shadowError(input: {
    request: AuthorizationRequest;
    mode: AuthorizationMode;
    error: unknown;
  }): void {
    this.logger.error(
      JSON.stringify({
        event: 'authorization.shadow_error',
        authorizationMode: input.mode,
        userId: input.request.userId,
        permission: input.request.permission,
        resourceType: input.request.resource.type,
        resourceId: input.request.resource.id,
        error: input.error instanceof Error ? input.error.name : 'UnknownError',
      }),
    );
  }
}
