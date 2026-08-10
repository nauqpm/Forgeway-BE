import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { WebPushRuntimeConfig } from '../config/web-push.config';

export class WebPushEndpointPolicy {
  constructor(private readonly runtimeConfig: WebPushRuntimeConfig) {}

  assertAllowed(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException(
        'Push subscription endpoint is not permitted',
      );
    }

    const hostname = url.hostname.toLowerCase();
    const ipHostname = hostname.replace(/^\[|\]$/g, '');
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      isIP(ipHostname) !== 0 ||
      !this.runtimeConfig.allowedEndpointHosts.has(hostname)
    ) {
      throw new BadRequestException(
        'Push subscription endpoint is not permitted',
      );
    }
  }
}
