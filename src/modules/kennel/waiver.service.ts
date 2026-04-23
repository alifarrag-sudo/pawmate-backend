import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// TODO: This waiver text is a placeholder. Real lawyer review is a LAUNCH BLOCKER.
// Must be reviewed and approved by Egyptian legal counsel before production launch.
const DEFAULT_WAIVER_TEMPLATE = `By signing, you acknowledge:
1. PawMateHub connects parents and kennels; the kennel operator is responsible for care.
2. Kennel operator exercises ordinary skill and care.
3. You warrant pet is healthy, vaccinated per kennel requirements.
4. In case of medical emergency, kennel will contact you. If unreachable, kennel may seek veterinary care at your expense.
5. You assume liability for any damage your pet causes to property or other pets.
6. Fee is non-refundable if pet is removed before the scheduled end date except by medical necessity.
7. Kennel reserves right to terminate stay for behavior/aggression with full refund of unused days.
8. Dispute resolution under Egyptian law, venue: Cairo.`;

@Injectable()
export class WaiverService {
  private readonly logger = new Logger(WaiverService.name);

  constructor(private readonly prisma: PrismaService) {}

  getDefaultWaiverTemplate(): string {
    return DEFAULT_WAIVER_TEMPLATE;
  }

  async getWaiverForKennel(kennelProfileId: string): Promise<{ text: string; version: number }> {
    const kennel = await this.prisma.kennelProfile.findUnique({
      where: { id: kennelProfileId },
      select: { liabilityWaiverText: true, liabilityWaiverVersion: true },
    });
    if (!kennel) {
      throw new NotFoundException('Kennel profile not found');
    }
    return {
      text: kennel.liabilityWaiverText,
      version: kennel.liabilityWaiverVersion,
    };
  }

  async recordWaiverSigning(
    stayId: string,
    signatureUrl: string,
    version: number,
  ): Promise<void> {
    const stay = await this.prisma.kennelStay.findUnique({
      where: { id: stayId },
    });
    if (!stay) {
      throw new NotFoundException('Kennel stay not found');
    }

    await this.prisma.kennelStay.update({
      where: { id: stayId },
      data: {
        liabilityWaiverSignatureUrl: signatureUrl,
        liabilityWaiverVersion: version,
        liabilityWaiverSignedAt: new Date(),
      },
    });

    this.logger.log(`Waiver v${version} signed for stay ${stayId}`);
  }
}
