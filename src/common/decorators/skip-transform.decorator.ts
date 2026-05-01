import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route handler so the global TransformInterceptor leaves the response
 * body untouched. Used for endpoints whose API contract is a flat object — most
 * notably the auth endpoints (login/register/refresh) which mobile + web parse
 * as `{ accessToken, refreshToken, user }` directly, not `{ success, data: {...} }`.
 */
export const SKIP_TRANSFORM_KEY = 'skipTransform';
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
