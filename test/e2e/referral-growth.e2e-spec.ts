/**
 * Suite 10 -- Referral Growth Flow
 *
 * Tests the ReferralsService: code generation format, referral tracking
 * on signup via redeemCode, and duplicate referral rejection.
 */

import { BadRequestException } from '@nestjs/common';
import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { ReferralsService } from '../../src/modules/referrals/referrals.service';
import { createUser } from '../factories/user.factory';

// ── Test suite ─────────────────────────────────────────────────────────────

describe('Referral Growth Flow', () => {
  let ctx: TestContext;
  let referralsService: ReferralsService;

  const referrerUser = createUser({
    id: 'referrer-1',
    firstName: 'Ali',
    referralCode: null,
  });

  const refereeUser = createUser({
    id: 'referee-1',
    firstName: 'Sara',
    referralCode: null,
  });

  beforeEach(async () => {
    ctx = await buildTestModule([ReferralsService]);
    referralsService = ctx.module.get(ReferralsService);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 1: Referral code format validation
  // ──────────────────────────────────────────────────────────────────────

  it('should generate a referral code matching 3 uppercase letters + 3 digits', async () => {
    // User has no existing referral code
    ctx.prisma.user.findUnique.mockResolvedValue({
      ...referrerUser,
      referralCode: null,
    });

    // No collision on first attempt
    ctx.prisma.user.count.mockResolvedValue(0);

    ctx.prisma.user.update.mockImplementation(async (args: any) => ({
      ...referrerUser,
      referralCode: args.data.referralCode,
    }));

    const code = await referralsService.generateReferralCode(referrerUser.id as string);

    // Format: 3 uppercase letters + 3 digits (e.g. "ALI234")
    expect(code).toMatch(/^[A-Z]{3}\d{3}$/);

    // Should start with first 3 chars of firstName uppercased
    expect(code.slice(0, 3)).toBe('ALI');
  });

  it('should return existing code if user already has one', async () => {
    const userWithCode = { ...referrerUser, referralCode: 'ALI789' };
    ctx.prisma.user.findUnique.mockResolvedValue(userWithCode);

    const code = await referralsService.generateReferralCode(referrerUser.id as string);

    expect(code).toBe('ALI789');
    // Should NOT call update since code already exists
    expect(ctx.prisma.user.update).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 2: Referral tracking on signup
  // ──────────────────────────────────────────────────────────────────────

  it('should create a referral record when a new user redeems a code', async () => {
    const referralCode = 'ALI234';

    // Referrer found
    ctx.prisma.user.findFirst.mockResolvedValue({
      id: referrerUser.id,
    });

    // No existing referral for this referee
    ctx.prisma.referral.findFirst.mockResolvedValue(null);

    ctx.prisma.referral.create.mockResolvedValue({
      id: 'referral-1',
      referrerUserId: referrerUser.id,
      referralCode,
      refereeUserId: refereeUser.id,
      status: 'SIGNED_UP',
      createdAt: new Date(),
    });

    await referralsService.redeemCode(referralCode, refereeUser.id as string);

    expect(ctx.prisma.referral.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        referrerUserId: referrerUser.id,
        referralCode: referralCode.toUpperCase(),
        refereeUserId: refereeUser.id,
        status: 'SIGNED_UP',
      }),
    });

    // Verify event emitted
    expect(ctx.eventSpy.hasEvent('referral.signed_up')).toBe(true);
    const events = ctx.eventSpy.getByEvent('referral.signed_up');
    expect(events[0].payload).toEqual(
      expect.objectContaining({
        referrerId: referrerUser.id,
        refereeId: refereeUser.id,
        code: referralCode,
      }),
    );
  });

  it('should reject self-referral', async () => {
    ctx.prisma.user.findFirst.mockResolvedValue({
      id: referrerUser.id,
    });

    await expect(
      referralsService.redeemCode('ALI234', referrerUser.id as string),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject an invalid referral code', async () => {
    // No user found with this code
    ctx.prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      referralsService.redeemCode('INVALID', refereeUser.id as string),
    ).rejects.toThrow(BadRequestException);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 3: Duplicate referral rejected
  // ──────────────────────────────────────────────────────────────────────

  it('should reject a second referral code for the same referee', async () => {
    const firstCode = 'ALI234';
    const secondCode = 'BOB567';

    // Referrer for the second code exists
    ctx.prisma.user.findFirst.mockResolvedValue({
      id: 'other-referrer',
    });

    // Referee already has a referral record (from the first code)
    ctx.prisma.referral.findFirst.mockResolvedValue({
      id: 'existing-referral',
      referrerUserId: referrerUser.id,
      referralCode: firstCode,
      refereeUserId: refereeUser.id,
      status: 'SIGNED_UP',
    });

    await expect(
      referralsService.redeemCode(secondCode, refereeUser.id as string),
    ).rejects.toThrow(BadRequestException);

    // referral.create should NOT have been called
    expect(ctx.prisma.referral.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Bonus: getShareInfo returns code + share message
  // ──────────────────────────────────────────────────────────────────────

  it('should return share info with code and message', async () => {
    ctx.prisma.user.findUnique.mockResolvedValue({
      ...referrerUser,
      referralCode: null,
    });
    ctx.prisma.user.count.mockResolvedValue(0);
    ctx.prisma.user.update.mockImplementation(async (args: any) => ({
      ...referrerUser,
      referralCode: args.data.referralCode,
    }));

    const shareInfo = await referralsService.getShareInfo(referrerUser.id as string);

    expect(shareInfo.code).toMatch(/^[A-Z]{3}\d{3}$/);
    expect(shareInfo.shareMessage).toContain(shareInfo.code);
    expect(shareInfo.shareMessage).toContain('pawmatehub.com');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Bonus: getMyReferrals returns stats
  // ──────────────────────────────────────────────────────────────────────

  it('should return referral stats and history', async () => {
    ctx.prisma.user.findUnique.mockResolvedValue({
      referralCode: 'ALI234',
      accountCreditEgp: 50,
    });

    ctx.prisma.referral.findMany.mockResolvedValue([
      {
        id: 'ref-1',
        referralCode: 'ALI234',
        refereeRole: 'PARENT',
        status: 'REWARDED',
        rewardEgp: 50,
        rewardType: 'CREDIT',
        createdAt: new Date(),
        qualifiedAt: new Date(),
        rewardedAt: new Date(),
        referee: { firstName: 'Sara', lastName: 'Ahmed' },
      },
      {
        id: 'ref-2',
        referralCode: 'ALI234',
        refereeRole: null,
        status: 'SIGNED_UP',
        rewardEgp: null,
        rewardType: null,
        createdAt: new Date(),
        qualifiedAt: null,
        rewardedAt: null,
        referee: { firstName: 'Omar', lastName: 'Khalil' },
      },
    ]);

    const result = await referralsService.getMyReferrals(referrerUser.id as string);

    expect(result.code).toBe('ALI234');
    expect(result.accountCreditEgp).toBe(50);
    expect(result.referrals).toHaveLength(2);
    expect(result.stats.signedUp).toBe(1);
    expect(result.stats.rewarded).toBe(1);
    expect(result.stats.totalEarned).toBe(50);
  });
});
