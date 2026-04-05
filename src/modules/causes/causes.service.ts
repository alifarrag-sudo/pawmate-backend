import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const MIN_DONATION = 10;
const MAX_CAUSE_DAYS = 90;

@Injectable()
export class CausesService {
  private readonly logger = new Logger(CausesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================================
  // CAUSES CRUD
  // ============================================================

  async create(userId: string, data: {
    title: string;
    description: string;
    category: string;
    goalAmount: number;
    endDate: string;
    coverPhoto?: string;
    photos?: string[];
    withdrawalMethod?: string;
    withdrawalAccount?: string;
  }) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required.');
    if (!data.description?.trim()) throw new BadRequestException('Description is required.');
    if (!data.goalAmount || data.goalAmount < 100) throw new BadRequestException('Goal must be at least 100 EGP.');
    const end = new Date(data.endDate);
    if (isNaN(end.getTime())) throw new BadRequestException('Invalid end date.');
    const now = new Date();
    if (end <= now) throw new BadRequestException('End date must be in the future.');
    const maxEnd = new Date(now.getTime() + MAX_CAUSE_DAYS * 24 * 60 * 60 * 1000);
    if (end > maxEnd) throw new BadRequestException(`End date cannot exceed ${MAX_CAUSE_DAYS} days from now.`);

    return this.prisma.cause.create({
      data: {
        creatorId: userId,
        title: data.title,
        description: data.description,
        category: data.category as any,
        goalAmount: data.goalAmount,
        endDate: end,
        coverPhoto: data.coverPhoto,
        photos: data.photos || [],
        withdrawalMethod: data.withdrawalMethod,
        withdrawalAccount: data.withdrawalAccount,
        status: 'pending_approval',
      } as any,
    });
  }

  async list(params: {
    category?: string;
    search?: string;
    page?: number;
  }) {
    const page = params.page || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { status: 'active', deletedAt: null, endDate: { gte: new Date() } };
    if (params.category) where.category = params.category;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cause.findMany({
        where,
        include: { creator: { select: { id: true, firstName: true, profilePhoto: true } } },
        orderBy: { endDate: 'asc' }, // urgency: soonest deadline first
        skip,
        take: limit,
      }),
      this.prisma.cause.count({ where }),
    ]);

    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const cause = await this.prisma.cause.findFirst({
      where: { id, deletedAt: null },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        _count: { select: { donations: true } },
      },
    });
    if (!cause) throw new NotFoundException('Cause not found.');
    return cause;
  }

  async getMine(userId: string) {
    return this.prisma.cause.findMany({
      where: { creatorId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, data: any) {
    const cause = await this.getById(id);
    if (cause.creatorId !== userId) throw new ForbiddenException('Not your cause.');
    if (cause.status !== 'pending_approval') throw new BadRequestException('Can only edit causes pending approval.');
    return this.prisma.cause.update({ where: { id }, data: data as any });
  }

  // ============================================================
  // DONATIONS
  // ============================================================

  async donate(donorId: string, causeId: string, data: {
    amount: number;
    message?: string;
    isAnonymous?: boolean;
  }) {
    if (!data.amount || data.amount < MIN_DONATION) {
      throw new BadRequestException(`Minimum donation is ${MIN_DONATION} EGP.`);
    }

    const cause = await this.getById(causeId);
    if (cause.status !== 'active') throw new BadRequestException('This cause is not accepting donations.');
    if (new Date(cause.endDate) < new Date()) throw new BadRequestException('This cause has ended.');

    const donor = await this.prisma.user.findUnique({ where: { id: donorId }, select: { walletBalance: true, firstName: true, lastName: true } });
    if (!donor) throw new NotFoundException('Donor not found.');
    if (Number(donor.walletBalance) < data.amount) {
      throw new BadRequestException('Insufficient wallet balance.');
    }

    // Atomic: deduct wallet, create donation, increment raisedAmount + donorCount
    const [donation] = await this.prisma.$transaction([
      this.prisma.donation.create({
        data: {
          causeId,
          donorId,
          amount: data.amount,
          message: data.message,
          isAnonymous: data.isAnonymous ?? false,
        } as any,
      }),
      this.prisma.user.update({
        where: { id: donorId },
        data: { walletBalance: { decrement: data.amount } } as any,
      }),
      this.prisma.cause.update({
        where: { id: causeId },
        data: {
          raisedAmount: { increment: data.amount },
          donorCount: { increment: 1 },
        } as any,
      }),
    ]);

    // Check if goal reached
    const updated = await this.prisma.cause.findUnique({ where: { id: causeId } });
    if (updated && Number(updated.raisedAmount) >= Number(updated.goalAmount) && (updated.status as string) !== 'goal_reached') {
      await this.prisma.cause.update({ where: { id: causeId }, data: { status: 'goal_reached' } as any });
      this.eventEmitter.emit('cause.goal_reached', { cause: updated, creatorId: cause.creatorId });
    }

    const donorName = data.isAnonymous ? 'Anonymous' : `${donor.firstName} ${donor.lastName}`;
    this.eventEmitter.emit('cause.donated', {
      causeId,
      causeTitle: cause.title,
      creatorId: cause.creatorId,
      donorName,
      amount: data.amount,
    });

    return donation;
  }

  async getDonors(causeId: string, page = 1) {
    await this.getById(causeId);
    const limit = 30;
    const donations = await this.prisma.donation.findMany({
      where: { causeId },
      include: {
        donor: { select: { id: true, firstName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return donations.map((d: any) => ({
      id: d.id,
      amount: d.amount,
      message: d.message,
      isAnonymous: d.isAnonymous,
      createdAt: d.createdAt,
      donor: d.isAnonymous ? { firstName: 'Anonymous', profilePhoto: null } : d.donor,
    }));
  }

  // ============================================================
  // CAUSE UPDATES
  // ============================================================

  async postUpdate(userId: string, causeId: string, data: { text: string; photoUrl?: string }) {
    const cause = await this.getById(causeId);
    if (cause.creatorId !== userId) throw new ForbiddenException('Not your cause.');
    if (!data.text?.trim()) throw new BadRequestException('Update text is required.');

    const update = await this.prisma.causeUpdate.create({
      data: { causeId, text: data.text, photoUrl: data.photoUrl },
    });

    // Fan-out to all unique donors
    const donors = await this.prisma.donation.findMany({
      where: { causeId },
      select: { donorId: true },
      distinct: ['donorId'],
    });

    this.eventEmitter.emit('cause.updated', {
      causeId,
      causeTitle: cause.title,
      updateText: data.text,
      donorIds: donors.map((d: any) => d.donorId),
    });

    return update;
  }

  async getUpdates(causeId: string) {
    await this.getById(causeId);
    return this.prisma.causeUpdate.findMany({
      where: { causeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================================
  // WITHDRAWALS
  // ============================================================

  async requestWithdrawal(userId: string, causeId: string, data: {
    amount: number;
    method: string;
    destination: string;
  }) {
    const cause = await this.getById(causeId);
    if (cause.creatorId !== userId) throw new ForbiddenException('Not your cause.');
    const raised = Number(cause.raisedAmount);

    // Check existing pending withdrawals don't exceed raised
    const pending = await this.prisma.withdrawalRequest.aggregate({
      where: { causeId, status: { in: ['pending', 'approved'] } },
      _sum: { amount: true },
    });
    const pendingTotal = Number((pending._sum as any).amount || 0);
    if (pendingTotal + data.amount > raised) {
      throw new BadRequestException(`Cannot request ${data.amount} EGP — only ${raised - pendingTotal} EGP available.`);
    }

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        causeId,
        requestedById: userId,
        amount: data.amount,
        method: data.method,
        destination: data.destination,
        status: 'pending',
      } as any,
    });

    this.eventEmitter.emit('withdrawal.requested', { causeId, causeTitle: cause.title, amount: data.amount, requestId: request.id });
    return request;
  }

  async getWithdrawals(userId: string, causeId: string) {
    const cause = await this.getById(causeId);
    if (cause.creatorId !== userId) throw new ForbiddenException('Not your cause.');
    return this.prisma.withdrawalRequest.findMany({
      where: { causeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================================
  // ADMIN
  // ============================================================

  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role !== 'admin') throw new ForbiddenException('Admin access required.');
  }

  async adminListPending(adminId: string) {
    await this.assertAdmin(adminId);
    return this.prisma.cause.findMany({
      where: { status: 'pending_approval' },
      include: { creator: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adminApprove(adminId: string, causeId: string) {
    await this.assertAdmin(adminId);
    const cause = await this.getById(causeId);
    if (cause.status !== 'pending_approval') throw new BadRequestException('Cause is not pending approval.');
    const updated = await this.prisma.cause.update({
      where: { id: causeId },
      data: { status: 'active', approvedById: adminId, approvedAt: new Date() } as any,
    });
    this.eventEmitter.emit('cause.approved', { causeId, creatorId: cause.creatorId, title: cause.title });
    return updated;
  }

  async adminReject(adminId: string, causeId: string, reason: string) {
    await this.assertAdmin(adminId);
    const cause = await this.getById(causeId);
    const updated = await this.prisma.cause.update({
      where: { id: causeId },
      data: { status: 'rejected', rejectionReason: reason } as any,
    });
    this.eventEmitter.emit('cause.rejected', { causeId, creatorId: cause.creatorId, title: cause.title, reason });
    return updated;
  }

  async adminListWithdrawals(adminId: string) {
    await this.assertAdmin(adminId);
    return this.prisma.withdrawalRequest.findMany({
      where: { status: 'pending' },
      include: {
        cause: { select: { id: true, title: true, raisedAmount: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adminApproveWithdrawal(adminId: string, withdrawalId: string, notes?: string) {
    await this.assertAdmin(adminId);
    const w = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: { cause: { select: { title: true, creatorId: true } } },
    });
    if (!w) throw new NotFoundException('Withdrawal request not found.');
    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'approved', adminNotes: notes, reviewedAt: new Date() } as any,
    });
    this.eventEmitter.emit('withdrawal.approved', {
      withdrawalId,
      creatorId: (w.cause as any).creatorId,
      amount: w.amount,
      causeTitle: (w.cause as any).title,
    });
    return updated;
  }

  async adminRejectWithdrawal(adminId: string, withdrawalId: string, notes?: string) {
    await this.assertAdmin(adminId);
    const w = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: { cause: { select: { title: true, creatorId: true } } },
    });
    if (!w) throw new NotFoundException('Withdrawal request not found.');
    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: 'rejected', adminNotes: notes, reviewedAt: new Date() } as any,
    });
    this.eventEmitter.emit('withdrawal.rejected', {
      withdrawalId,
      creatorId: (w.cause as any).creatorId,
      amount: w.amount,
      causeTitle: (w.cause as any).title,
      reason: notes,
    });
    return updated;
  }
}
