import { SetMetadata } from '@nestjs/common';

// Marks a route as JWT-free **only** when the deployment is running in
// sandbox mode (process.env.SANDBOX_MODE === 'true'). In production builds
// the route remains JWT-protected exactly as if this decorator weren't
// applied. Useful for friends-and-family flows that need to bootstrap a
// session without an existing token (e.g. phone-OTP signup) without
// weakening the production security posture.
export const SANDBOX_PUBLIC_KEY = 'sandboxPublic';
export const SandboxPublic = () => SetMetadata(SANDBOX_PUBLIC_KEY, true);
