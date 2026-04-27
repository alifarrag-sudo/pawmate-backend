import { Injectable } from '@nestjs/common';

@Injectable()
export class DepositService {
  calculateDeposit(totalCost: number, depositPercentage: number): { deposit: number; balance: number } {
    const deposit = Math.ceil(totalCost * depositPercentage / 100);
    const balance = totalCost - deposit;
    return { deposit, balance };
  }

  calculateStayCost(
    nights: number,
    pricePerNight: number,
    longStayNights: number,
    longStayPricePerNight: number | null,
  ): number {
    if (longStayPricePerNight && nights >= longStayNights) {
      return nights * longStayPricePerNight;
    }
    return nights * pricePerNight;
  }

  isWithinRefundWindow(
    cancelledAt: Date,
    checkInDate: Date,
    refundWindowHours: number,
  ): boolean {
    const hoursBeforeCheckIn = (checkInDate.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);
    return hoursBeforeCheckIn > refundWindowHours;
  }
}
