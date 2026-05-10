/**
 * Meet & Greet consent text — versioned.
 *
 * The current rendered text is snapshotted onto each MeetGreetConsent row
 * at the time of consent so a later wording change can't retroactively
 * change what a parent agreed to. Bumping CONSENT_TEXT_VERSION here means
 * any parent who consents after the deploy will store the new wording on
 * their row alongside the new version string.
 *
 * Service whitelist: BOARDING and DAY_CARE are the only types that show
 * the Meet & Greet step. Other types (WALKING / VET / GROOMING / etc.)
 * skip it entirely — they're either too short to justify a pre-meet
 * (WALKING) or happen in a controlled facility (VET / GROOMING / KENNEL).
 */
import { ServiceType } from '@prisma/client';

export const CONSENT_TEXT_VERSION = 'v1.0';

export const CONSENT_TEXT_EN =
  "I agree to arrange a Meet & Greet with my PetFriend before the service " +
  'begins. I understand this helps ensure the best care for my pet and ' +
  'allows both parties to confirm compatibility.';

export const CONSENT_TEXT_AR =
  'أوافق على ترتيب لقاء تعارف مع PetFriend قبل بدء الخدمة. أفهم أن هذا ' +
  'يساعد على ضمان أفضل رعاية لحيواني الأليف ويتيح لكلا الطرفين تأكيد ' +
  'التوافق.';

export const MEET_GREET_ELIGIBLE_SERVICES: ServiceType[] = [
  ServiceType.BOARDING,
  ServiceType.DAY_CARE,
];

export function isMeetGreetEligible(serviceType: ServiceType | string): boolean {
  return (MEET_GREET_ELIGIBLE_SERVICES as string[]).includes(serviceType as string);
}
