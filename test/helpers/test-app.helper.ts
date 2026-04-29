/**
 * E2E Test Application Helper
 *
 * Creates a NestJS testing module with mocked external services.
 * Tests run against real service logic but with mocked DB, payments,
 * email, file uploads, and AI calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/common/services/redis.service';
import { MailService } from '../../src/modules/mail/mail.service';

// ── Mock builders ────────────────────────────────────────────────────────────

export function createMockPrisma() {
  const mockModel = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: {}, _avg: {}, _count: 0 }),
    groupBy: jest.fn().mockResolvedValue([]),
  });

  return {
    user: mockModel(),
    pet: mockModel(),
    booking: mockModel(),
    review: mockModel(),
    petFriendProfile: mockModel(),
    trainerProfile: mockModel(),
    kennelProfile: mockModel(),
    petHotelProfile: mockModel(),
    shopProfile: mockModel(),
    vetProfile: mockModel(),
    groomerProfile: mockModel(),
    businessProfile: mockModel(),
    teamMember: mockModel(),
    refreshToken: mockModel(),
    petFriendPayout: mockModel(),
    paymentTransaction: mockModel(),
    processedWebhookEvent: mockModel(),
    reputationSnapshot: mockModel(),
    vetConsultation: mockModel(),
    ePrescription: mockModel(),
    auditLog: mockModel(),
    kennelUnit: mockModel(),
    kennelStay: mockModel(),
    kennelStayDailyLog: mockModel(),
    shopProduct: mockModel(),
    shopOrder: mockModel(),
    shopOrderItem: mockModel(),
    eventBridgeDelivery: mockModel(),
    referral: mockModel(),
    notification: mockModel(),
    bookingEndCode: mockModel(),
    overtimeLog: mockModel(),
    $transaction: jest.fn((fn: (prisma: any) => Promise<any>) => fn(null as any)),
  };
}

export function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, val: string) => { store.set(key, val); return Promise.resolve('OK'); }),
    setex: jest.fn((key: string, _ttl: number, val: string) => { store.set(key, val); return Promise.resolve('OK'); }),
    del: jest.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
    exists: jest.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    incr: jest.fn().mockResolvedValue(1),
    _store: store,
  };
}

export function createMockMail() {
  return {
    sendOTP: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetLink: jest.fn().mockResolvedValue(undefined),
    sendTeamWelcomeWithLoginLink: jest.fn().mockResolvedValue(undefined),
    sendPetFriendApproved: jest.fn().mockResolvedValue(undefined),
    sendPetFriendRejection: jest.fn().mockResolvedValue(undefined),
    sendBookingConfirmed: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendVerificationCode: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Event spy ────────────────────────────────────────────────────────────────

export function createEventSpy(emitter: EventEmitter2) {
  const captured: Array<{ event: string; payload: unknown }> = [];
  const originalEmit = emitter.emit.bind(emitter);

  jest.spyOn(emitter, 'emit').mockImplementation((event: string, ...args: unknown[]) => {
    captured.push({ event, payload: args[0] });
    return originalEmit(event, ...args);
  });

  return {
    captured,
    getByEvent: (name: string) => captured.filter((e) => e.event === name),
    hasEvent: (name: string) => captured.some((e) => e.event === name),
    clear: () => { captured.length = 0; },
  };
}

// ── Module builder ───────────────────────────────────────────────────────────

export interface TestContext {
  module: TestingModule;
  prisma: ReturnType<typeof createMockPrisma>;
  redis: ReturnType<typeof createMockRedis>;
  mail: ReturnType<typeof createMockMail>;
  events: EventEmitter2;
  eventSpy: ReturnType<typeof createEventSpy>;
}

/**
 * Build a test module with specified service providers + mocked infra.
 * Pass the NestJS module classes you want to test.
 */
export async function buildTestModule(
  providers: any[],
  imports: any[] = [],
): Promise<TestContext> {
  const prisma = createMockPrisma();
  const redis = createMockRedis();
  const mail = createMockMail();

  const module = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), ...imports],
    providers: [
      ...providers,
      { provide: PrismaService, useValue: prisma },
      { provide: RedisService, useValue: redis },
      { provide: MailService, useValue: mail },
    ],
  }).compile();

  const events = module.get(EventEmitter2);
  const eventSpy = createEventSpy(events);

  // Wire $transaction to pass the prisma mock itself
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

  return { module, prisma, redis, mail, events, eventSpy };
}
