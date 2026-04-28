import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvestorService } from './investor.service';
import { InvestorGuard } from './investor.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MailService } from '../mail/mail.service';

describe('InvestorService', () => {
  let service: InvestorService;
  let prisma: any;
  let redis: any;
  let mail: any;
  let events: any;

  beforeEach(async () => {
    prisma = {
      booking: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalPrice: 0 },
          _avg: { totalPrice: 0 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      petFriendProfile: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    redis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
    };

    mail = {
      sendTeamWelcomeWithLoginLink: jest.fn().mockResolvedValue(undefined),
    };

    events = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestorService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: MailService, useValue: mail },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<InvestorService>(InvestorService);
  });

  // ── getMetricsDetailed ───────────────────────────────────────────────────────

  describe('getMetricsDetailed', () => {
    it('should return correct shape with monthly arrays', async () => {
      prisma.booking.count.mockResolvedValue(25);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: 50000 },
        _avg: { totalPrice: 2000 },
      });
      prisma.user.count.mockResolvedValue(100);
      prisma.petFriendProfile.count.mockResolvedValue(15);
      prisma.petFriendProfile.groupBy.mockResolvedValue([
        { addressCity: 'Cairo', _count: { _all: 10 } },
        { addressCity: 'Alexandria', _count: { _all: 5 } },
      ]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.petFriendProfile.findMany.mockResolvedValue([]);

      const result = await service.getMetricsDetailed();

      // Top-level shape
      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('growth');
      expect(result).toHaveProperty('unitEconomics');
      expect(result).toHaveProperty('geographic');
      expect(result).toHaveProperty('providers');
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('asOf');

      // Revenue shape
      const revenue = result.revenue as Record<string, unknown>;
      expect(revenue).toHaveProperty('monthly');
      expect(revenue).toHaveProperty('byProviderType');
      expect(revenue).toHaveProperty('avgBookingValue');
      expect(Array.isArray(revenue.monthly)).toBe(true);
      expect(Array.isArray(revenue.byProviderType)).toBe(true);
      expect(typeof revenue.avgBookingValue).toBe('number');

      // Monthly array should have 12+ entries
      const monthly = revenue.monthly as Array<Record<string, unknown>>;
      expect(monthly.length).toBeGreaterThanOrEqual(12);
      expect(monthly[0]).toHaveProperty('month');
      expect(monthly[0]).toHaveProperty('gmv');
      expect(monthly[0]).toHaveProperty('commission');

      // Growth shape
      const growth = result.growth as Record<string, unknown>;
      expect(Array.isArray(growth.parentSignups)).toBe(true);
      expect(Array.isArray(growth.providerApprovals)).toBe(true);
      expect(Array.isArray(growth.bookingVolume)).toBe(true);
      expect(typeof growth.retentionRate).toBe('number');

      // Unit economics shape
      const ue = result.unitEconomics as Record<string, unknown>;
      expect(typeof ue.takeRate).toBe('number');
      expect(typeof ue.estimatedLtv).toBe('number');
      expect(ue.cacPlaceholder).toBe('Tracking since launch');

      // Geographic shape
      const geo = result.geographic as Array<Record<string, unknown>>;
      expect(Array.isArray(geo)).toBe(true);

      // Providers shape
      const providers = result.providers as Record<string, unknown>;
      expect(Array.isArray(providers.byType)).toBe(true);
      expect(typeof providers.avgRating).toBe('number');
      expect(typeof providers.retentionRate).toBe('number');
      expect(typeof providers.reviewRate).toBe('number');
    });

    it('should compute take rate correctly when there is revenue', async () => {
      prisma.booking.count.mockResolvedValue(10);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: 100000 },
        _avg: { totalPrice: 10000 },
      });
      prisma.user.count.mockResolvedValue(50);
      prisma.petFriendProfile.count.mockResolvedValue(5);
      prisma.petFriendProfile.groupBy.mockResolvedValue([]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.petFriendProfile.findMany.mockResolvedValue([]);

      const result = await service.getMetricsDetailed();
      const ue = result.unitEconomics as Record<string, unknown>;

      // 15% commission rate
      expect(ue.takeRate).toBe(0.15);
    });

    it('should return fallback with empty arrays when queries throw', async () => {
      prisma.booking.count.mockRejectedValue(new Error('DB down'));

      const result = await service.getMetricsDetailed();

      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('growth');
      const revenue = result.revenue as Record<string, unknown>;
      expect(Array.isArray(revenue.monthly)).toBe(true);
      expect((revenue.monthly as unknown[]).length).toBe(0);
    });

    it('should include geographic data from provider city groupBy', async () => {
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _avg: { totalPrice: 0 },
      });
      prisma.user.count.mockResolvedValue(0);
      prisma.petFriendProfile.count.mockResolvedValue(3);
      prisma.petFriendProfile.groupBy.mockResolvedValue([
        { addressCity: 'Cairo', _count: { _all: 2 } },
        { addressCity: 'Giza', _count: { _all: 1 } },
      ]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.petFriendProfile.findMany.mockResolvedValue([]);

      const result = await service.getMetricsDetailed();
      const geo = result.geographic as Array<Record<string, unknown>>;

      expect(geo).toHaveLength(2);
      expect(geo[0].city).toBe('Cairo');
      expect(geo[0].providers).toBe(2);
      expect(geo[1].city).toBe('Giza');
      expect(geo[1].providers).toBe(1);
    });
  });

  // ── getDocuments ─────────────────────────────────────────────────────────────

  describe('getDocuments', () => {
    it('should return document list with expected structure', async () => {
      const result = await service.getDocuments();

      expect(result).toHaveProperty('documents');
      expect(Array.isArray(result.documents)).toBe(true);
      expect(result.documents.length).toBeGreaterThan(0);

      const doc = result.documents[0] as Record<string, unknown>;
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('title');
      expect(doc).toHaveProperty('type');
      expect(doc).toHaveProperty('updatedAt');
    });

    it('should emit investor.document_accessed event', async () => {
      await service.getDocuments();

      expect(events.emit).toHaveBeenCalledWith(
        'investor.document_accessed',
        expect.objectContaining({ at: expect.any(String) }),
      );
    });
  });

  // ── getDocumentUrl ───────────────────────────────────────────────────────────

  describe('getDocumentUrl', () => {
    it('should return placeholder for unknown document', async () => {
      const result = await service.getDocumentUrl('unknown-doc-id');

      expect(result).toEqual({
        url: null,
        message: 'Document not yet uploaded',
      });
    });

    it('should return placeholder for known document id', async () => {
      const result = await service.getDocumentUrl('pitch-deck-2026');

      expect(result.url).toBeNull();
      expect(result.message).toBe('Document not yet uploaded');
    });

    it('should emit investor.document_downloaded event', async () => {
      await service.getDocumentUrl('test-doc');

      expect(events.emit).toHaveBeenCalledWith(
        'investor.document_downloaded',
        expect.objectContaining({
          documentId: 'test-doc',
          at: expect.any(String),
        }),
      );
    });
  });

  // ── getSafeNote ──────────────────────────────────────────────────────────────

  describe('getSafeNote', () => {
    it('should return SAFE note data with correct structure', async () => {
      const result = await service.getSafeNote('user-123');

      expect(result).toEqual({
        investmentType: 'SAFE Note',
        amount: null,
        valuationCap: null,
        discountRate: null,
        investmentDate: null,
        status: 'Active',
        terms: 'Standard Y Combinator SAFE with valuation cap and discount',
        proRataRights: true,
      });
    });

    it('should return same structure for any userId (placeholder)', async () => {
      const result1 = await service.getSafeNote('user-a');
      const result2 = await service.getSafeNote('user-b');

      expect(result1).toEqual(result2);
    });
  });

  // ── getUpdates ───────────────────────────────────────────────────────────────

  describe('getUpdates', () => {
    it('should return updates array with welcome entry', async () => {
      const result = await service.getUpdates();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const welcome = result[0];
      expect(welcome.id).toBe('welcome');
      expect(welcome.date).toBe('2026-04-28');
      expect(welcome.subject).toContain('Welcome');
      expect(typeof welcome.body).toBe('string');
      expect(welcome.read).toBe(false);
    });

    it('should include subject and body fields in each update', async () => {
      const result = await service.getUpdates();

      for (const update of result) {
        expect(update).toHaveProperty('id');
        expect(update).toHaveProperty('date');
        expect(update).toHaveProperty('subject');
        expect(update).toHaveProperty('body');
        expect(update).toHaveProperty('read');
      }
    });
  });

  // ── getMessages ──────────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('should return empty messages array', async () => {
      const result = await service.getMessages();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should return message with senderRole investor', async () => {
      const result = await service.sendMessage('user-123', {
        body: 'When is the next board meeting?',
      });

      expect(result).toHaveProperty('id');
      expect(result.body).toBe('When is the next board meeting?');
      expect(result.senderRole).toBe('investor');
      expect(result).toHaveProperty('createdAt');
      expect(typeof result.id).toBe('string');
      expect(typeof result.createdAt).toBe('string');
    });

    it('should emit investor.message_sent event', async () => {
      await service.sendMessage('user-456', {
        body: 'Test message',
      });

      expect(events.emit).toHaveBeenCalledWith(
        'investor.message_sent',
        expect.objectContaining({
          userId: 'user-456',
          body: 'Test message',
          id: expect.any(String),
          createdAt: expect.any(String),
        }),
      );
    });

    it('should generate unique ids for each message', async () => {
      const msg1 = await service.sendMessage('user-1', { body: 'First' });
      const msg2 = await service.sendMessage('user-1', { body: 'Second' });

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  // ── createInvestorUpdate (admin) ─────────────────────────────────────────────

  describe('createInvestorUpdate', () => {
    it('should return created update with id, title, body, date', async () => {
      const result = await service.createInvestorUpdate({
        title: 'Q1 2026 Update',
        body: '## Highlights\n- GMV grew 40%',
        date: '2026-04-28',
      });

      expect(result).toHaveProperty('id');
      expect(result.title).toBe('Q1 2026 Update');
      expect(result.body).toBe('## Highlights\n- GMV grew 40%');
      expect(result.date).toBe('2026-04-28');
      expect(result).toHaveProperty('createdAt');
    });

    it('should use current date when date is not provided', async () => {
      const result = await service.createInvestorUpdate({
        title: 'No date update',
        body: 'Body content here for the update.',
      });

      // date should be in YYYY-MM-DD format
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should emit investor.update_created event', async () => {
      await service.createInvestorUpdate({
        title: 'Event test',
        body: 'Body for event test content.',
      });

      expect(events.emit).toHaveBeenCalledWith(
        'investor.update_created',
        expect.objectContaining({
          id: expect.any(String),
          title: 'Event test',
          date: expect.any(String),
        }),
      );
    });
  });

  // ── uploadInvestorDoc (admin) ────────────────────────────────────────────────

  describe('uploadInvestorDoc', () => {
    it('should return success with document details', async () => {
      const result = await service.uploadInvestorDoc({
        title: 'Q1 Financial Model',
        section: 'financials',
        fileUrl: 'https://res.cloudinary.com/pawmate/raw/upload/v1/model.xlsx',
      });

      expect(result.message).toBe('Document uploaded successfully.');
      expect(result.document).toHaveProperty('id');
      expect(result.document.title).toBe('Q1 Financial Model');
      expect(result.document.section).toBe('financials');
      expect(result.document.fileUrl).toBe(
        'https://res.cloudinary.com/pawmate/raw/upload/v1/model.xlsx',
      );
      expect(result.document).toHaveProperty('uploadedAt');
    });

    it('should emit investor.document_uploaded event', async () => {
      await service.uploadInvestorDoc({
        title: 'Test Doc',
        section: 'legal',
        fileUrl: 'https://example.com/doc.pdf',
      });

      expect(events.emit).toHaveBeenCalledWith(
        'investor.document_uploaded',
        expect.objectContaining({
          id: expect.any(String),
          title: 'Test Doc',
          section: 'legal',
        }),
      );
    });
  });
});

// ── InvestorGuard tests ──────────────────────────────────────────────────────

describe('InvestorGuard', () => {
  let guard: InvestorGuard;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestorGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<InvestorGuard>(InvestorGuard);
  });

  function createMockContext(userId?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { sub: userId } : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access for users with INVESTOR role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      roles: ['INVESTOR'],
      role: 'user',
    });

    const result = await guard.canActivate(createMockContext('user-1'));
    expect(result).toBe(true);
  });

  it('should allow access for admin users without INVESTOR role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      roles: [],
      role: 'admin',
    });

    const result = await guard.canActivate(createMockContext('admin-1'));
    expect(result).toBe(true);
  });

  it('should allow access for owner role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      roles: [],
      role: 'owner',
    });

    const result = await guard.canActivate(createMockContext('owner-1'));
    expect(result).toBe(true);
  });

  it('should reject users without INVESTOR or admin role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      roles: ['PET_OWNER'],
      role: 'user',
    });

    await expect(guard.canActivate(createMockContext('user-2'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should reject when no userId in request', async () => {
    await expect(guard.canActivate(createMockContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should reject when user not found in database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(createMockContext('ghost-user'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
