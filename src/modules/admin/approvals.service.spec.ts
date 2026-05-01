import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let prisma: {
    approval: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      approval: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<ApprovalsService>(ApprovalsService);
  });

  // ── list ─────────────────────────────────────────────────────

  describe('list', () => {
    it('returns { data, total, pending }, defaults to limit 50', async () => {
      const items = [{ id: 'a1' }, { id: 'a2' }];
      prisma.approval.findMany.mockResolvedValue(items);
      prisma.approval.count
        .mockResolvedValueOnce(2) // total filtered
        .mockResolvedValueOnce(7); // pending overall

      const result = await service.list({});

      expect(result).toEqual({ data: items, total: 2, pending: 7 });
      expect(prisma.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('normalises lower-case status filter (web client form)', async () => {
      prisma.approval.findMany.mockResolvedValue([]);
      prisma.approval.count.mockResolvedValue(0);

      await service.list({ status: 'pending' as any });

      expect(prisma.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ApprovalStatus.PENDING }),
        }),
      );
    });

    it('passes through agentId / actionType / routing filters', async () => {
      prisma.approval.findMany.mockResolvedValue([]);
      prisma.approval.count.mockResolvedValue(0);

      await service.list({
        agentId: 'farida',
        actionType: 'expense.autocategorise',
        routing: 'ali_only',
      });

      expect(prisma.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId: 'farida',
            actionType: 'expense.autocategorise',
            routing: 'ali_only',
          }),
        }),
      );
    });

    it('clamps limit to 200 max', async () => {
      prisma.approval.findMany.mockResolvedValue([]);
      prisma.approval.count.mockResolvedValue(0);

      await service.list({ limit: 9999 });

      expect(prisma.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  // ── getById ──────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the approval when it exists', async () => {
      const row = { id: 'a1', status: 'PENDING' };
      prisma.approval.findUnique.mockResolvedValue(row);

      expect(await service.getById('a1')).toEqual(row);
    });

    it('throws NotFound when missing', async () => {
      prisma.approval.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('creates an approval and emits approval.created', async () => {
      const created = {
        id: 'a1',
        agentId: 'farida',
        actionType: 'expense.autocategorise',
        routing: 'ali_or_john',
        createdAt: new Date('2026-05-01T10:00:00Z'),
      };
      prisma.approval.create.mockResolvedValue(created);

      const result = await service.create({
        agentId: 'farida',
        actionType: 'expense.autocategorise',
        payload: { amount: 1500 },
        reasoning: 'Routine vendor invoice',
      });

      expect(result).toEqual(created);
      expect(prisma.approval.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: 'farida',
          actionType: 'expense.autocategorise',
          routing: 'ali_or_john', // default
        }),
      });
      expect(emitter.emit).toHaveBeenCalledWith(
        'approval.created',
        expect.objectContaining({
          approvalId: 'a1',
          agentId: 'farida',
          routing: 'ali_or_john',
        }),
      );
    });

    it('honours an explicit ali_only routing', async () => {
      prisma.approval.create.mockResolvedValue({
        id: 'a1',
        agentId: 'salma',
        actionType: 'payout.batch',
        routing: 'ali_only',
        createdAt: new Date(),
      });

      await service.create({
        agentId: 'salma',
        actionType: 'payout.batch',
        payload: {},
        routing: 'ali_only',
      });

      expect(prisma.approval.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ routing: 'ali_only' }),
      });
    });
  });

  // ── resolve ─────────────────────────────────────────────────

  describe('resolve', () => {
    const pendingApproval = {
      id: 'a1',
      agentId: 'farida',
      actionType: 'expense.autocategorise',
      status: ApprovalStatus.PENDING,
      routing: 'ali_or_john',
    };

    it('approves a pending approval and emits approval.resolved', async () => {
      const resolvedAt = new Date();
      prisma.approval.findUnique.mockResolvedValue(pendingApproval);
      prisma.approval.update.mockResolvedValue({
        ...pendingApproval,
        status: ApprovalStatus.APPROVED,
        resolution: 'approved',
        resolvedBy: 'user-ali',
        resolvedAt,
      });

      const result = await service.resolve(
        'a1',
        { action: 'approved', comment: 'OK' },
        { id: 'user-ali', roles: ['owner'] },
      );

      expect(result.status).toBe(ApprovalStatus.APPROVED);
      expect(prisma.approval.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({
          status: ApprovalStatus.APPROVED,
          resolution: 'approved',
          comment: 'OK',
          resolvedBy: 'user-ali',
        }),
      });
      expect(emitter.emit).toHaveBeenCalledWith(
        'approval.resolved',
        expect.objectContaining({
          approvalId: 'a1',
          action: 'approved',
          resolvedBy: 'user-ali',
        }),
      );
    });

    it('rejects a pending approval', async () => {
      prisma.approval.findUnique.mockResolvedValue(pendingApproval);
      prisma.approval.update.mockResolvedValue({
        ...pendingApproval,
        status: ApprovalStatus.REJECTED,
        resolution: 'rejected',
        resolvedBy: 'user-john',
      });

      await service.resolve(
        'a1',
        { action: 'rejected', comment: 'Out of policy' },
        { id: 'user-john', roles: ['owner_restricted'] },
      );

      expect(prisma.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApprovalStatus.REJECTED,
            resolution: 'rejected',
          }),
        }),
      );
    });

    it('throws ConflictException when already resolved', async () => {
      prisma.approval.findUnique.mockResolvedValue({
        ...pendingApproval,
        status: ApprovalStatus.APPROVED,
      });

      await expect(
        service.resolve(
          'a1',
          { action: 'approved' },
          { id: 'user-ali', roles: ['owner'] },
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.approval.update).not.toHaveBeenCalled();
    });

    it('rejects ali_only resolution by owner_restricted', async () => {
      prisma.approval.findUnique.mockResolvedValue({
        ...pendingApproval,
        routing: 'ali_only',
      });

      await expect(
        service.resolve(
          'a1',
          { action: 'approved' },
          { id: 'user-john', roles: ['owner_restricted'] },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.approval.update).not.toHaveBeenCalled();
    });

    it('allows ali_only resolution by owner', async () => {
      prisma.approval.findUnique.mockResolvedValue({
        ...pendingApproval,
        routing: 'ali_only',
      });
      prisma.approval.update.mockResolvedValue({
        ...pendingApproval,
        routing: 'ali_only',
        status: ApprovalStatus.APPROVED,
      });

      await expect(
        service.resolve(
          'a1',
          { action: 'approved' },
          { id: 'user-ali', roles: ['owner'] },
        ),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException when approval is missing', async () => {
      prisma.approval.findUnique.mockResolvedValue(null);

      await expect(
        service.resolve(
          'missing',
          { action: 'approved' },
          { id: 'user-ali', roles: ['owner'] },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
