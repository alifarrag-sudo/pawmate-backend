import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PriceParams {
  bookingType: 'hourly' | 'daily' | 'weekly' | 'monthly';
  startTime: Date;
  endTime: Date;
  petCount: number;
  sitterProfile: {
    hourlyRate?: any;
    dailyRate?: any;
    weeklyRate?: any;
    monthlyRate?: any;
    extraPetFee?: any;
  };
}

interface PriceBreakdown {
  basePrice: number;
  commissionRate: number;
  commissionAmount: number;
  totalPrice: number;
  sitterPayout: number;
  currency: string;
  lineItems: { label: string; amount: number }[];
}

@Injectable()
export class PricingService {
  constructor(private configService: ConfigService) {}

  calculate(params: PriceParams): PriceBreakdown {
    const { bookingType, startTime, endTime, petCount, sitterProfile } = params;

    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = durationMs / (1000 * 60 * 60);
    const days = hours / 24;
    const lineItems: { label: string; amount: number }[] = [];

    // Validate minimum durations
    this.validateDuration(bookingType, hours, days);

    let basePrice = 0;

    switch (bookingType) {
      case 'hourly': {
        const rate = Number(sitterProfile.hourlyRate);
        if (!rate) throw new BadRequestException('Sitter does not offer hourly bookings.');
        const hoursRounded = Math.ceil(hours);
        basePrice = hoursRounded * rate;
        lineItems.push({ label: `${hoursRounded} hour(s) × ${rate} EGP/hr`, amount: basePrice });
        break;
      }
      case 'daily': {
        const rate = Number(sitterProfile.dailyRate);
        if (!rate) throw new BadRequestException('Sitter does not offer daily bookings.');
        const daysRounded = Math.ceil(days);
        basePrice = daysRounded * rate;
        lineItems.push({ label: `${daysRounded} day(s) × ${rate} EGP/day`, amount: basePrice });
        break;
      }
      case 'weekly': {
        const rate = Number(sitterProfile.weeklyRate);
        if (!rate) throw new BadRequestException('Sitter does not offer weekly bookings.');
        const weeks = Math.ceil(days / 7);
        basePrice = weeks * rate;
        lineItems.push({ label: `${weeks} week(s) × ${rate} EGP/week`, amount: basePrice });
        break;
      }
      case 'monthly': {
        const rate = Number(sitterProfile.monthlyRate);
        if (!rate) throw new BadRequestException('Sitter does not offer monthly bookings.');
        const months = Math.ceil(days / 30);
        basePrice = months * rate;
        lineItems.push({ label: `${months} month(s) × ${rate} EGP/month`, amount: basePrice });
        break;
      }
    }

    // Extra pet fee
    const extraPetFee = Number(sitterProfile.extraPetFee) || 0;
    if (petCount > 1 && extraPetFee > 0) {
      const extraFee = (petCount - 1) * extraPetFee;
      basePrice += extraFee;
      lineItems.push({ label: `${petCount - 1} extra pet(s) × ${extraPetFee} EGP`, amount: extraFee });
    }

    // Commission
    const commissionRate = Number(this.configService.get('PLATFORM_COMMISSION_PERCENT', 15));
    const commissionAmount = Math.ceil(basePrice * (commissionRate / 100));
    const totalPrice = basePrice; // Owner pays base price; commission deducted from sitter
    const sitterPayout = basePrice - commissionAmount;

    return {
      basePrice,
      commissionRate,
      commissionAmount,
      totalPrice,
      sitterPayout,
      currency: 'EGP',
      lineItems,
    };
  }

  private validateDuration(bookingType: string, hours: number, days: number): void {
    const minimums: Record<string, { value: number; unit: string; label: string }> = {
      hourly: { value: 1, unit: 'hours', label: '1 hour' },
      daily: { value: 1, unit: 'days', label: '1 day' },
      weekly: { value: 3, unit: 'days', label: '3 days' },
      monthly: { value: 20, unit: 'days', label: '20 days' },
    };

    const min = minimums[bookingType];
    if (!min) return;

    const actual = min.unit === 'hours' ? hours : days;
    if (actual < min.value) {
      throw new BadRequestException({
        error: 'BOOKING_TOO_SHORT',
        message: `Minimum duration for ${bookingType} bookings is ${min.label}.`,
      });
    }
  }
}
