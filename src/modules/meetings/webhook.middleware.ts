import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as bodyParser from 'body-parser';

@Injectable()
export class LivekitWebhookMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Chỉ parse thành raw Buffer với đúng Content-Type của LiveKit
    bodyParser.raw({ type: 'application/webhook+json' })(req, res, next);
  }
}
