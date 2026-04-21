/**
 * Feature flags — read from environment at runtime.
 * Community features (social feed, adoption, causes/donations) are archived
 * behind ENABLE_COMMUNITY. Set to 'true' to restore.
 */
export const isCommunityEnabled = (): boolean =>
  process.env.ENABLE_COMMUNITY === 'true';
