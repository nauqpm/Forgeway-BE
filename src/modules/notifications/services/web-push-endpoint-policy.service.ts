import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { WebPushRuntimeConfig } from '../config/web-push.config';

export class WebPushEndpointPolicy {
  constructor(private readonly runtimeConfig: WebPushRuntimeConfig) {}

  isAllowed(endpoint: string): boolean {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    const ipHostname = hostname.replace(/^\[|\]$/g, '');
    return !(
      url.protocol !== 'https:' ||
      url.port !== '' ||
      isIP(ipHostname) !== 0 ||
      !this.runtimeConfig.allowedEndpointHosts.has(hostname)
    );
  }

  assertAllowed(endpoint: string): void {
    if (!this.isAllowed(endpoint)) {
      throw new BadRequestException(
        'Push subscription endpoint is not permitted',
      );
    }
  }
}
