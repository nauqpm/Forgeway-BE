import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SsoLoginService } from '../services/sso-login.service';
import { IsNotEmpty, IsString } from 'class-validator';

export class SsoTokenDto {
  @IsNotEmpty()
  @IsString()
  code!: string;
}

@ApiTags('SSO')
@Controller('auth/sso')
export class SsoController {
  constructor(private readonly ssoLoginService: SsoLoginService) {}

  @ApiOperation({
    summary: 'Exchange SSO Authorization Code for ID Token',
    description:
      'Validates the authorization code and returns an ID token containing the user profile.',
  })
  @ApiResponse({
    status: 200,
    description: 'Code successfully exchanged for an ID token.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('token')
  async exchangeToken(@Body() dto: SsoTokenDto) {
    const idToken = await this.ssoLoginService.exchangeCodeForToken(dto.code);
    return {
      success: true,
      id_token: idToken,
    };
  }
}
