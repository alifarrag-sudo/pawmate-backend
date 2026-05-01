import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ServiceType, DayCareSessionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Per-service pricing engine for the new taxonomy.
 *
 * Service rules:
 * - BOARDING: per-night rate × nights, plus optional late-pickup hourly fee after 2pm
 *   on checkout day.
 * - WALKING: per-hour rate × hours (min 1), plus optional extra-time fee for walks
 *   that overrun (parent must pre-approve).
 * - DAY_CARE: flat 6-hour or 8-hour session rate, plus late-pickup fee per hour past
 *   the session end.
 *
 * No platform-enforced caps. Sanity bounds only: rate must be > 0 and ≤ 99,999 EGP.
 */

export const RATE_FLOOR_EGP = 1;
export const RATE_CEILING_EGP = 99_999;
export const BOARDING_CHECKOUT_HOUR = 14; // 2:00 PM Cairo local time
const MS_PER_HOUR = 60 * 60 * 1000;

export interface BoardingPricingInput {
  serviceType: 'BOARDING';
  numberOfNights: number;
  perNightRateEgp: number;
  latePickupHourlyRateEgp?: number; // not applied here — only via calculateLatePickupFee
}

export interface WalkingPricingInput {
  serviceType: 'WALKING';
  numberOfHours: number;
  perHourRateEgp: number;
  minimumHours?: number;
}

export interface DayCarePricingInput {
  serviceType: 'DAY_CARE';
  sessionType: DayCareSessionType;
  sixHourRateEgp: number;
  eightHourRateEgp: number;
}

export type BookingPricingInput =
  | BoardingPricingInput
  | WalkingPricingInput
  | DayCarePricingInput;

export interface BookingPriceBreakdown {
  base: number;
  total: number;
  currency: 'EGP';
  serviceType: ServiceType;
  lineItems: { label: string; amount: number }[];
}

export interface LatePickupResult {
  hoursLate: number;
  fee: number;
  charged: boolean;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Validate a provider-set rate. Rejects 0, negatives, and silly typos like 1_000_000 EGP.
   * No min/max from the platform — providers price freely within these guardrails.
   */
  validateRate(rateEgp: number, fieldName = 'rate'): void {
    if (!Number.isFinite(rateEgp) || !Number.isInteger(rateEgp)) {
      throw new BadRequestException(`${fieldName} must be a whole-number EGP value`);
    }
    if (rateEgp < RATE_FLOOR_EGP) {
      throw new BadRequestException(`${fieldName} must be greater than 0 EGP`);
    }
    if (rateEgp > RATE_CEILING_EGP) {
      throw new BadRequestException(
        `${fieldName} cannot exceed ${RATE_CEILING_EGP.toLocaleString()} EGP`,
      );
    }
  }

  /**
   * Calculate the base + total for a new booking.
   * Late fees are NOT included here — they are computed post-pickup via
   * `calculateLatePickupFee`.
   */
  calculateBookingPrice(input: BookingPricingInput): BookingPriceBreakdown {
    switch (input.serviceType) {
      case 'BOARDING':
        return this.calculateBoarding(input);
      case 'WALKING':
        return this.calculateWalking(input);
      case 'DAY_CARE':
        return this.calculateDayCare(input);
      default: {
        const _exhaustive: never = input;
        throw new BadRequestException(`Unsupported service type for pricing engine`);
      }
    }
  }

  private calculateBoarding(input: BoardingPricingInput): BookingPriceBreakdown {
    const { numberOfNights, perNightRateEgp } = input;
    if (!Number.isInteger(numberOfNights) || numberOfNights < 1) {
      throw new BadRequestException('Boarding requires at least 1 night');
    }
    this.validateRate(perNightRateEgp, 'perNightRateEgp');

    const base = numberOfNights * perNightRateEgp;
    return {
      base,
      total: base,
      currency: 'EGP',
      serviceType: 'BOARDING',
      lineItems: [
        {
          label: `${numberOfNights} night(s) × ${perNightRateEgp} EGP`,
          amount: base,
        },
      ],
    };
  }

  private calculateWalking(input: WalkingPricingInput): BookingPriceBreakdown {
    const { numberOfHours, perHourRateEgp } = input;
    const minimumHours = Math.max(1, input.minimumHours ?? 1);
    if (!Number.isInteger(numberOfHours) || numberOfHours < minimumHours) {
      throw new BadRequestException(
        `Walking booking must be at least ${minimumHours} hour(s)`,
      );
    }
    this.validateRate(perHourRateEgp, 'perHourRateEgp');

    const base = numberOfHours * perHourRateEgp;
    return {
      base,
      total: base,
      currency: 'EGP',
      serviceType: 'WALKING',
      lineItems: [
        { label: `${numberOfHours} hour(s) × ${perHourRateEgp} EGP/hr`, amount: base },
      ],
    };
  }

  private calculateDayCare(input: DayCarePricingInput): BookingPriceBreakdown {
    const { sessionType, sixHourRateEgp, eightHourRateEgp } = input;
    this.validateRate(sixHourRateEgp, 'sixHourRateEgp');
    this.validateRate(eightHourRateEgp, 'eightHourRateEgp');

    const base = sessionType === 'SIX_HOUR' ? sixHourRateEgp : eightHourRateEgp;
    const label =
      sessionType === 'SIX_HOUR' ? '6-hour session' : '8-hour session';

    return {
      base,
      total: base,
      currency: 'EGP',
      serviceType: 'DAY_CARE',
      lineItems: [{ label: `${label} flat rate`, amount: base }],
    };
  }

  /**
   * Compute the late-pickup fee for a BOARDING or DAY_CARE booking.
   * Returns { hoursLate: 0, fee: 0 } if pickup was on time.
   */
  async calculateLatePickupFee(
    bookingId: string,
    actualPickupTime: Date,
  ): Promise<{ hoursLate: number; fee: number }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        serviceType: true,
        checkoutDate: true,
        sessionEndTime: true,
        petFriendId: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    let referenceTime: Date | null = null;
    let hourlyRateEgp: number | null = null;

    if (booking.serviceType === 'BOARDING') {
      if (!booking.checkoutDate) return { hoursLate: 0, fee: 0 };
      referenceTime = boardingCutoffOn(booking.checkoutDate);

      if (booking.petFriendId) {
        const profile = await this.prisma.petFriendProfile.findUnique({
          where: { userId: booking.petFriendId },
          select: { boardingLatePickupHourlyEgp: true },
        });
        hourlyRateEgp = profile?.boardingLatePickupHourlyEgp ?? null;
      }
    } else if (booking.serviceType === 'DAY_CARE') {
      if (!booking.sessionEndTime) return { hoursLate: 0, fee: 0 };
      referenceTime = booking.sessionEndTime;

      if (booking.petFriendId) {
        const profile = await this.prisma.petFriendProfile.findUnique({
          where: { userId: booking.petFriendId },
          select: { daycareLatePickupHourlyEgp: true },
        });
        hourlyRateEgp = profile?.daycareLatePickupHourlyEgp ?? null;
      }
    } else {
      // Other service types don't accrue late-pickup fees
      return { hoursLate: 0, fee: 0 };
    }

    if (!referenceTime || hourlyRateEgp == null) return { hoursLate: 0, fee: 0 };

    const deltaMs = actualPickupTime.getTime() - referenceTime.getTime();
    if (deltaMs <= 0) return { hoursLate: 0, fee: 0 };

    const hoursLate = Math.ceil(deltaMs / MS_PER_HOUR);
    const fee = hoursLate * hourlyRateEgp;
    return { hoursLate, fee };
  }

  /**
   * Record the actual pickup time on a booking, persist any late fee, and
   * stage the late-fee charge in the payments ledger.
   *
   * For each late pickup we:
   *   1. Update the booking with actualPickupTime / lateFeeHours / lateFeeEgp
   *   2. Create a `late_fee` PaymentTransaction (status=pending) — the
   *      payments module/cron picks this up and submits to Paymob using the
   *      stored gatewayRef from the original booking_payment row. We do NOT
   *      call Paymob's capture API directly here to keep the financial path
   *      auditable and idempotent.
   *   3. Emit `booking.late_pickup_charged` so notifications + dashboards
   *      can react.
   */
  async recordPickup(bookingId: string, actualPickupTime: Date): Promise<LatePickupResult> {
    const { hoursLate, fee } = await this.calculateLatePickupFee(bookingId, actualPickupTime);

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        actualPickupTime,
        lateFeeHours: hoursLate,
        lateFeeEgp: fee,
      },
      select: { id: true, parentId: true, petFriendId: true, paymentMethod: true },
    });

    if (fee > 0) {
      // Stage the charge — payments service / cron will submit to Paymob.
      // Idempotency: gatewayRef is unique per row so duplicate calls would
      // fail at the DB level if we used a deterministic id. For now we omit
      // gatewayRef on this pending row; it'll be populated on submission.
      await this.prisma.paymentTransaction.create({
        data: {
          userId: updated.parentId,
          bookingId: updated.id,
          type: 'late_fee',
          amount: fee,
          direction: 'debit',
          status: 'pending',
          gateway: (updated.paymentMethod as any) ?? null,
        },
      });

      this.eventEmitter.emit('booking.late_pickup_charged', {
        bookingId: updated.id,
        parentId: updated.parentId,
        petFriendId: updated.petFriendId,
        lateFeeEgp: fee,
        hoursLate,
        chargedAt: new Date(),
      });

      this.logger.log(
        `Late pickup recorded: booking=${updated.id} hours=${hoursLate} fee=${fee} EGP`,
      );
    }

    return {
      hoursLate,
      fee,
      charged: fee > 0,
    };
  }
}

/**
 * Returns a Date set to 2:00 PM (boarding checkout cutoff) on the same calendar day
 * as the input. Uses UTC arithmetic — Cairo is UTC+2 year-round (no DST), so 14:00
 * local equals 12:00 UTC. Timezone handling will be normalized when the timezone util
 * is applied here in a follow-up pass; for now we treat checkoutDate as local midnight
 * and add 14 hours.
 */
function boardingCutoffOn(checkoutDate: Date): Date {
  const d = new Date(checkoutDate);
  d.setUTCHours(BOARDING_CHECKOUT_HOUR - 2, 0, 0, 0); // 12:00 UTC == 14:00 Cairo
  return d;
}
