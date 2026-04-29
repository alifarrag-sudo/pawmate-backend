/**
 * Suite 2 — Provider Auto-Approval
 *
 * Tests PetFriendService profile completion logic, auto-approval,
 * and admin rejection at the service level with mocked Prisma.
 */

import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { PetFriendService } from '../../src/modules/petfriend/petfriend.service';
import { UploadsService } from '../../src/modules/uploads/uploads.service';
import { createUser } from '../factories/user.factory';
import { createPetFriendProfile, createPendingPetFriend } from '../factories/petfriend.factory';

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockUploadsService() {
  return {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/test/uploaded.jpg',
      publicId: 'test/uploaded',
    }),
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Provider Auto-Approval', () => {
  let ctx: TestContext;
  let petFriendService: PetFriendService;

  const userId = 'petfriend-user-1';
  const profileId = 'profile-pf-1';

  beforeEach(async () => {
    ctx = await buildTestModule([
      PetFriendService,
      { provide: UploadsService, useValue: createMockUploadsService() },
    ]);

    petFriendService = ctx.module.get(PetFriendService);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: All docs uploaded -> auto-approved
  // ────────────────────────────────────────────────────────────────────────

  it('should auto-approve profile when all required fields are complete', async () => {
    // A profile in PENDING_DOCS state with all fields filled
    const completeProfile = createPetFriendProfile({
      id: profileId,
      userId,
      status: 'PENDING_DOCS',
      bio: 'Experienced and loving pet carer with over 5 years.',
      pccUrl: 'https://res.cloudinary.com/test/pcc.pdf',
      selfieWithIdUrl: 'https://res.cloudinary.com/test/selfie.jpg',
      servicesOffered: ['boarding', 'dog_walking'],
      ratePerHour: 100,
      addressCity: 'Cairo',
      autoApprovedAt: null,
    });

    const userWithDocs = createUser({
      id: userId,
      profilePhoto: 'https://res.cloudinary.com/test/photo.jpg',
      idFrontUrl: 'https://res.cloudinary.com/test/id-front.jpg',
      idBackUrl: 'https://res.cloudinary.com/test/id-back.jpg',
    });

    // updateProfile will findUnique on profile, then update, then checkAndAutoApprove
    ctx.prisma.petFriendProfile.findUnique
      .mockResolvedValueOnce(completeProfile)    // updateProfile lookup
      .mockResolvedValueOnce(completeProfile);   // checkAndAutoApprove re-fetch (not needed since update returns)

    // The update from updateProfile
    ctx.prisma.petFriendProfile.update
      .mockResolvedValueOnce(completeProfile)    // the dto update
      .mockResolvedValueOnce({                   // the auto-approve update
        ...completeProfile,
        status: 'APPROVED',
        autoApprovedAt: expect.any(Date),
        isActive: true,
        isVerified: true,
      });

    // checkAndAutoApprove fetches user data for completion check
    ctx.prisma.user.findUnique.mockResolvedValue(userWithDocs);

    // Mock pricingBounds for rate validation (no bounds configured = skip)
    (ctx.prisma as any).pricingBounds = { findMany: jest.fn().mockResolvedValue([]) };

    const result = await petFriendService.updateProfile(userId, {
      bio: 'Experienced and loving pet carer with over 5 years.',
    } as any);

    // The service returns the result of the first update; auto-approve happens as side effect
    expect(result).toBeDefined();

    // Verify auto-approve was triggered (second petFriendProfile.update call)
    expect(ctx.prisma.petFriendProfile.update).toHaveBeenCalledTimes(2);
    const autoApproveCall = ctx.prisma.petFriendProfile.update.mock.calls[1];
    expect(autoApproveCall[0].data.status).toBe('APPROVED');
    expect(autoApproveCall[0].data.isActive).toBe(true);
    expect(autoApproveCall[0].data.isVerified).toBe(true);

    // Verify event emitted
    expect(ctx.eventSpy.hasEvent('petfriend.auto_approved')).toBe(true);
    const approvalEvent = ctx.eventSpy.getByEvent('petfriend.auto_approved')[0];
    expect((approvalEvent.payload as any).userId).toBe(userId);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: Missing PCC -> stays PENDING_DOCS
  // ────────────────────────────────────────────────────────────────────────

  it('should NOT auto-approve profile when PCC is missing', async () => {
    const incompleteProfile = createPendingPetFriend({
      id: profileId,
      userId,
      status: 'PENDING_DOCS',
      bio: 'Experienced pet carer.',
      pccUrl: null,                              // <-- Missing PCC
      selfieWithIdUrl: 'https://res.cloudinary.com/test/selfie.jpg',
      servicesOffered: ['boarding'],
      ratePerHour: 100,
      addressCity: 'Cairo',
    });

    const userWithPartialDocs = createUser({
      id: userId,
      profilePhoto: 'https://res.cloudinary.com/test/photo.jpg',
      idFrontUrl: 'https://res.cloudinary.com/test/id-front.jpg',
      idBackUrl: 'https://res.cloudinary.com/test/id-back.jpg',
    });

    ctx.prisma.petFriendProfile.findUnique.mockResolvedValue(incompleteProfile);
    ctx.prisma.petFriendProfile.update.mockResolvedValue(incompleteProfile);
    ctx.prisma.user.findUnique.mockResolvedValue(userWithPartialDocs);

    (ctx.prisma as any).pricingBounds = { findMany: jest.fn().mockResolvedValue([]) };

    await petFriendService.updateProfile(userId, {
      bio: 'Updated bio for my profile.',
    } as any);

    // Only one update call (the profile field update), no auto-approve call
    expect(ctx.prisma.petFriendProfile.update).toHaveBeenCalledTimes(1);

    // No auto-approval event
    expect(ctx.eventSpy.hasEvent('petfriend.auto_approved')).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Admin rejection sets status and sends email
  // ────────────────────────────────────────────────────────────────────────

  it('should set status to REJECTED on admin review and trigger rejection email', async () => {
    const adminUser = createUser({ id: 'admin-1', role: 'admin', roles: ['ADMIN'] });

    const pendingProfile = createPetFriendProfile({
      id: profileId,
      userId,
      status: 'ADMIN_REVIEW',
    });

    const profileUser = createUser({
      id: userId,
      email: 'sitter@pawmate.test',
      firstName: 'Ahmed',
    });

    // adminReview first fetches the profile
    ctx.prisma.petFriendProfile.findUnique.mockResolvedValue(pendingProfile);

    // adminReview updates the profile
    const rejectedProfile = {
      ...pendingProfile,
      status: 'REJECTED',
      adminReviewedAt: expect.any(Date),
      adminReviewedBy: adminUser.id,
      rejectionReason: 'ID photo is blurry',
      isActive: false,
    };
    ctx.prisma.petFriendProfile.update.mockResolvedValue(rejectedProfile);

    // For the rejection email, it fetches user by userId
    ctx.prisma.user.findUnique.mockResolvedValue(profileUser);

    const result = await petFriendService.adminReview(
      profileId,
      'reject',
      'ID photo is blurry',
      adminUser.id,
    );

    // Verify status set to REJECTED
    expect(result.status).toBe('REJECTED');

    // Verify the update was called with correct data
    expect(ctx.prisma.petFriendProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: profileId },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'ID photo is blurry',
          isActive: false,
        }),
      }),
    );

    // Verify rejection event emitted
    expect(ctx.eventSpy.hasEvent('petfriend.rejected')).toBe(true);
    const rejectionEvent = ctx.eventSpy.getByEvent('petfriend.rejected')[0];
    expect((rejectionEvent.payload as any).action).toBe('reject');
    expect((rejectionEvent.payload as any).reason).toBe('ID photo is blurry');
    expect((rejectionEvent.payload as any).adminUserId).toBe(adminUser.id);

    // Verify rejection email was called
    // The service does: this.mail.sendPetFriendRejection(user, reason)
    // We need a small delay since it's fire-and-forget (.then chain)
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ctx.mail.sendPetFriendRejection).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sitter@pawmate.test' }),
      'ID photo is blurry',
    );
  });
});
