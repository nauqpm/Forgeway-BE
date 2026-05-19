import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface GoogleProfile {
  id: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{ value: string }>;
  photos?: Array<{ value: string }>;
}

interface GoogleUserProfile {
  email: string;
  fullName: string;
  id: string;
  photos: Array<{ value: string }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GOOGLE_REDIRECT_URL') || '',
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<GoogleUserProfile | undefined> {
    try {
      const { name, emails, photos } = profile;

      if (!emails || emails.length === 0) {
        done(new Error('No email found from Google profile'), undefined);
        return undefined;
      }

      const user = {
        email: emails[0].value,
        fullName: `${name?.givenName || ''} ${name?.familyName || ''}`.trim(),
        id: profile.id,
        photos: photos || [],
      };

      done(null, user);
      return user;
    } catch (error) {
      done(error, undefined);
      return undefined;
    }
  }
}
