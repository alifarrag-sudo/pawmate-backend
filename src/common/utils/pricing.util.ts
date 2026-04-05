// PawMate dynamic pricing — base rates, tier ranges, helper functions

export const BASE_RATES: Record<string, number> = {
  dog_walking:        150, // EGP per hour
  house_sitting:      300, // EGP per day
  daycare:            200, // EGP per day
  overnight_boarding: 250, // EGP per night
  drop_in:             80, // EGP per visit
};

export const SERVICE_UNITS: Record<string, string> = {
  dog_walking:        'hr',
  house_sitting:      'day',
  daycare:            'day',
  overnight_boarding: 'night',
  drop_in:            'visit',
};

// Multiplier ranges per tier
const TIER_RANGES: Record<string, { minMult: number; maxMult: number }> = {
  new:      { minMult: 0.8, maxMult: 1.0 },
  bronze:   { minMult: 0.9, maxMult: 1.2 },
  silver:   { minMult: 1.0, maxMult: 1.5 },
  gold:     { minMult: 1.2, maxMult: 2.0 },
  platinum: { minMult: 1.5, maxMult: 2.5 },
};

const TRAINER_CAP_BONUS = 0.30; // +30% on top of tier max cap

/**
 * Determine the sitter's pricing tier from their review stats.
 * Tier is primarily based on review count; rating gates entry to higher tiers.
 */
export function computeSitterTier(totalReviews: number, avgRating: number): string {
  const rating = Number(avgRating) || 0;
  if (totalReviews === 0) return 'new';
  if (totalReviews <= 10) return 'bronze';
  if (totalReviews <= 30) return rating >= 4.0 ? 'silver' : 'bronze';
  if (totalReviews <= 60) return rating >= 4.5 ? 'gold' : 'silver';
  return rating >= 4.8 ? 'platinum' : 'gold';
}

/**
 * Return the allowed price range for a given service and tier.
 */
export function getPriceRange(
  serviceType: string,
  tier: string,
  isVerifiedTrainer = false,
): { min: number; max: number } {
  const base = BASE_RATES[serviceType] ?? 100;
  const { minMult, maxMult } = TIER_RANGES[tier] ?? TIER_RANGES.new;
  const trainerBonus = isVerifiedTrainer ? TRAINER_CAP_BONUS : 0;
  return {
    min: Math.round(base * minMult),
    max: Math.round(base * maxMult * (1 + trainerBonus)),
  };
}

/**
 * Build the full pricing info for all services for a sitter profile.
 */
export function buildPricingInfo(
  totalReviews: number,
  avgRating: number,
  isVerifiedTrainer: boolean,
  currentPrices: Record<string, number | null>,
) {
  const tier = computeSitterTier(totalReviews, avgRating);
  const services = Object.keys(BASE_RATES);
  const ranges: Record<string, { min: number; max: number; current: number | null; unit: string }> = {};

  for (const svc of services) {
    const range = getPriceRange(svc, tier, isVerifiedTrainer);
    ranges[svc] = {
      ...range,
      current: currentPrices[svc] ?? null,
      unit: SERVICE_UNITS[svc],
    };
  }

  return { tier, isVerifiedTrainer, services: ranges };
}
