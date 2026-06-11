import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskKeyService {
  private readonly fallbackPrefix = 'TASK';
  private readonly maxPrefixLength = 10;
  private readonly minPrefixLength = 1;

  create(workspaceName: string | undefined, sequence: number): string {
    const prefix = this.createPrefix(workspaceName);
    return `${prefix}-${sequence}`;
  }

  createPrefix(workspaceName: string | undefined): string {
    const tokens = this.tokenize(workspaceName);
    if (tokens.length === 0) {
      return this.fallbackPrefix;
    }

    const source = tokens.join('');
    let prefix =
      tokens.length === 1
        ? source.slice(0, this.maxPrefixLength)
        : this.createMultiTokenPrefix(tokens);

    if (prefix.length < this.minPrefixLength) {
      prefix = (prefix + source).slice(0, this.minPrefixLength);
    }

    return prefix || this.fallbackPrefix;
  }

  private createMultiTokenPrefix(tokens: string[]): string {
    const [firstToken, ...remainingTokens] = tokens;
    let prefix = firstToken.slice(0, 3);

    for (const token of remainingTokens) {
      const remainingLength = this.maxPrefixLength - prefix.length;
      if (remainingLength <= 0) {
        break;
      }

      prefix += this.pickTokenBoundary(token, remainingLength);
    }

    return prefix.slice(0, this.maxPrefixLength);
  }

  private pickTokenBoundary(token: string, maxLength: number): string {
    if (maxLength >= 2 && token.length >= 2) {
      return `${token[0]}${token[Math.floor(token.length / 2)]}`;
    }

    return token[0] || '';
  }

  private tokenize(value: string | undefined): string[] {
    if (!value) {
      return [];
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111|\u0110/g, 'd')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(token => token.toUpperCase());
  }
}
