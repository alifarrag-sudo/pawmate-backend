/**
 * SANDBOX MODE — single env-var feature flag (SANDBOX_MODE=true) that
 * collapses real verification and real money into deterministic stubs.
 *
 * Used by friends-and-family testers and demos:
 *   • OTP code is fixed to "123456" (no SMS sent)
 *   • Provider documents auto-approve on upload
 *   • LMS course can be force-passed without watching lessons
 *   • Paymob intent skips the real API and emits a sandbox token
 *   • PetFriend application auto-approves end-to-end
 *
 * Anything that reads `isSandbox()` MUST also check the env value at the
 * call site (not cache it) so a Railway restart with SANDBOX_MODE=false
 * disables every shortcut immediately.
 *
 * Production Railway: SANDBOX_MODE=false (or unset).
 * Local / staging:   SANDBOX_MODE=true.
 */

export const SANDBOX_CONFIG = {
  otpCode: '123456',
  autoApproveDocuments: true,
  autoPassCourse: true,
  autoApproveProvider: true,
  fakePaymentDelayMs: 1500,
  fakePaymentAlwaysSucceeds: true,
  skipProfileCompletionGate: true,
  sandboxScore: 95,
  sandboxCertificateLabel: 'SANDBOX — NOT VALID',
} as const;

export const isSandbox = (): boolean => process.env.SANDBOX_MODE === 'true';
