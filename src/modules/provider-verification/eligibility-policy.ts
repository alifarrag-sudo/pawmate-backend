/**
 * Provider service eligibility policy.
 *
 * The single source of truth for which services need what. Both the
 * /petfriend/services endpoint (for SERVICES-category mobile sign-ups)
 * and the future admin-side professional-services workflow read from
 * `SERVICE_ELIGIBILITY_POLICY` so the rules can't drift between code
 * paths.
 *
 * Course assignment rule (mirrored on mobile in
 * app/(petfriend-onboarding)/services.tsx):
 *   BOARDING in services        → BOARDING_PROVIDER_COURSE  (covers all 3)
 *   DAY_CARE without BOARDING   → DAY_CARE_PROVIDER_COURSE  (covers walking)
 *   WALKING only                → WALKER_SAFETY_MODULE
 *
 * The "highest-risk service in the selection" wins so a provider applying
 * for BOARDING + WALKING only takes one (the more demanding) course, but
 * each eligibility row remains distinct so a single service can be
 * suspended later without affecting the others.
 */
import {
  ProviderCategory,
  VerificationRiskTier,
  ServiceType,
} from '@prisma/client';

export const BOARDING_PROVIDER_COURSE = 'BOARDING_PROVIDER_COURSE';
export const DAY_CARE_PROVIDER_COURSE = 'DAY_CARE_PROVIDER_COURSE';
export const WALKER_SAFETY_MODULE = 'WALKER_SAFETY_MODULE';

export type RequiredCourseId =
  | typeof BOARDING_PROVIDER_COURSE
  | typeof DAY_CARE_PROVIDER_COURSE
  | typeof WALKER_SAFETY_MODULE;

/**
 * Returns the single required-course id for a provider's full service
 * selection. The most-demanding course wins so each service shares one
 * training requirement instead of stacking redundant courses.
 */
export const getRequiredCourse = (services: string[]): RequiredCourseId | null => {
  if (services.includes('BOARDING')) return BOARDING_PROVIDER_COURSE;
  if (services.includes('DAY_CARE')) return DAY_CARE_PROVIDER_COURSE;
  if (services.includes('WALKING')) return WALKER_SAFETY_MODULE;
  return null;
};

interface ServicePolicy {
  category: ProviderCategory;
  riskTier: VerificationRiskTier;
  /** Whether parents can book this service in-app (vs. on pawmatehub.com). */
  mobileBookable: boolean;
  /** Whether providers can sign up for this in the mobile app. */
  providerMobileSignup: boolean;
  /** Whether the service is shoppable on mobile (PET_SHOP only). */
  mobileShoppable?: boolean;
  /** Whether a training course must be completed before activation. */
  trainingRequired: boolean;
  /** The course id that satisfies this service. May be null. */
  requiredCourseId: RequiredCourseId | null;
}

export const SERVICE_ELIGIBILITY_POLICY: Record<string, ServicePolicy> = {
  WALKING: {
    category: ProviderCategory.SERVICES,
    riskTier: VerificationRiskTier.LOW,
    mobileBookable: true,
    providerMobileSignup: true,
    trainingRequired: true,
    requiredCourseId: WALKER_SAFETY_MODULE,
  },
  DAY_CARE: {
    category: ProviderCategory.SERVICES,
    riskTier: VerificationRiskTier.MEDIUM,
    mobileBookable: true,
    providerMobileSignup: true,
    trainingRequired: true,
    requiredCourseId: DAY_CARE_PROVIDER_COURSE,
  },
  BOARDING: {
    category: ProviderCategory.SERVICES,
    riskTier: VerificationRiskTier.HIGH,
    mobileBookable: true,
    providerMobileSignup: true,
    trainingRequired: true,
    requiredCourseId: BOARDING_PROVIDER_COURSE,
  },
  TRAINING: {
    category: ProviderCategory.PROFESSIONAL_SERVICES,
    riskTier: VerificationRiskTier.MEDIUM,
    mobileBookable: false,
    providerMobileSignup: false,
    trainingRequired: false,
    requiredCourseId: null,
  },
  PET_HOTEL: {
    category: ProviderCategory.PROFESSIONAL_SERVICES,
    riskTier: VerificationRiskTier.HIGH,
    mobileBookable: false,
    providerMobileSignup: false,
    trainingRequired: false,
    requiredCourseId: null,
  },
  KENNEL: {
    category: ProviderCategory.PROFESSIONAL_SERVICES,
    riskTier: VerificationRiskTier.HIGH,
    mobileBookable: false,
    providerMobileSignup: false,
    trainingRequired: false,
    requiredCourseId: null,
  },
  VET: {
    category: ProviderCategory.PETCARE,
    riskTier: VerificationRiskTier.HIGH,
    mobileBookable: false,
    providerMobileSignup: false,
    trainingRequired: false,
    requiredCourseId: null,
  },
  GROOMING: {
    category: ProviderCategory.PETCARE,
    riskTier: VerificationRiskTier.MEDIUM,
    mobileBookable: false,
    providerMobileSignup: false,
    trainingRequired: false,
    requiredCourseId: null,
  },
  PET_SHOP: {
    category: ProviderCategory.MARKETPLACE,
    riskTier: VerificationRiskTier.MEDIUM,
    mobileBookable: false,
    providerMobileSignup: false,
    mobileShoppable: true,
    trainingRequired: false,
    requiredCourseId: null,
  },
} as const;

/**
 * The narrow set of service types a PetFriend can pick via the mobile
 * /petfriend/services endpoint. Anything outside this whitelist requires
 * the admin-side professional-services workflow.
 */
export const SERVICES_CATEGORY_TYPES = ['WALKING', 'DAY_CARE', 'BOARDING'] as const;
export type ServicesCategoryType = (typeof SERVICES_CATEGORY_TYPES)[number];

export function isServicesCategoryType(s: string): s is ServicesCategoryType {
  return (SERVICES_CATEGORY_TYPES as readonly string[]).includes(s);
}

/**
 * Resolve the policy for a ServiceType. Throws if the type isn't in the
 * policy table — the policy must remain a complete enumeration of every
 * supported ServiceType.
 */
export function policyFor(serviceType: ServiceType | string): ServicePolicy {
  const policy = SERVICE_ELIGIBILITY_POLICY[serviceType as string];
  if (!policy) {
    throw new Error(`No eligibility policy for service type: ${serviceType}`);
  }
  return policy;
}
