export function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseCorsOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map(origin => normalizeCorsOrigin(origin))
    .filter(Boolean);
}

export function getAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const isProduction = env.NODE_ENV === 'production';
  const port = env.PORT || '5512';
  const configuredOrigins = [
    ...parseCorsOrigins(env.FRONTEND_URL),
    ...parseCorsOrigins(env.CORS_ORIGINS),
  ];

  const developmentOrigins = !isProduction
    ? [
        `http://localhost:${port}`,
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:3000',
        'http://localhost:3001',
      ]
    : [];

  return Array.from(new Set([...configuredOrigins, ...developmentOrigins]));
}

export function assertProductionCorsOriginsConfigured(
  allowedOrigins: string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error(
      'Production CORS requires FRONTEND_URL or CORS_ORIGINS to be configured',
    );
  }
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;

  return allowedOrigins.includes(normalizeCorsOrigin(origin));
}
