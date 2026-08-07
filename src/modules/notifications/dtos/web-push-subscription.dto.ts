import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const URL_SAFE_BASE64 = /^[A-Za-z0-9_-]+$/;

export class WebPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(URL_SAFE_BASE64)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(URL_SAFE_BASE64)
  auth!: string;
}

export class UpsertWebPushSubscriptionDto {
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}

export class RemoveWebPushSubscriptionDto {
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint!: string;
}

export type PushSubscriptionInput = UpsertWebPushSubscriptionDto;
