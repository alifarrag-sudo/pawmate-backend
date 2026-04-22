import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from '../mail/mail.service';
import {
  ApplyBusinessDto,
  UpdateBusinessProfileDto,
  CreateBranchDto,
  CreateTeamInviteDto,
  DirectCreateTeamMemberDto,
  UpdateTeamMemberDto,
  SuspendTeamMemberDto,
  AdminReviewBusinessDto,
} from './business.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const PAGE_SIZE = 20;

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly mail: MailService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private generateInviteCode(): string {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
  }

  private generateTempPassword(): string {
    return crypto.randomBytes(6).toString('base64url');
  }

  private async assertOwnerOrManager(userId: string, businessId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
    });
    if (!member || !['OWNER', 'MANAGER'].includes(member.role)) {
      throw new ForbiddenException('Only the business owner or manager can perform this action');
    }
    return member;
  }

  private async assertBusinessMember(userId: string, businessId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
    });
    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException('You are not a member of this business');
    }
    return member;
  }

  private checkAutoApproval(biz: any): boolean {
    return !!(
      biz.businessName &&
      biz.businessType &&
      biz.description &&
      biz.logoUrl &&
      biz.commercialRegDocUrl &&
      biz.taxCard &&
      biz.primaryAddress &&
      biz.primaryLat &&
      biz.primaryLng &&
      biz.businessEmail &&
      biz.businessPhone
    );
  }

  // ── Part B: Business Endpoints ───────────────────────────────────────────────

  async applyForBusiness(userId: string, dto: ApplyBusinessDto) {
    const existing = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
    });
    if (existing) {
      throw new ConflictException('You already have a business profile');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.businessProfile.create({
        data: {
          ownerId: userId,
          businessName: dto.businessName,
          businessType: dto.businessType as any,
          description: dto.description,
          businessEmail: dto.businessEmail,
          businessPhone: dto.businessPhone,
          primaryAddress: dto.primaryAddress,
          primaryCity: dto.primaryCity,
          primaryLat: dto.primaryLat,
          primaryLng: dto.primaryLng,
          status: 'PENDING_DOCS',
        },
      });

      // Auto-create OWNER TeamMember
      await tx.teamMember.create({
        data: {
          businessId: business.id,
          userId,
          role: 'OWNER',
          providerType: 'PETFRIEND', // default; owner can be either
          status: 'ACTIVE',
        },
      });

      // Add OPERATOR to user.roles[]
      const user = await tx.user.findUnique({ where: { id: userId } });
      const roles = user?.roles ?? [];
      if (!roles.includes('OPERATOR')) {
        await tx.user.update({
          where: { id: userId },
          data: { roles: [...roles, 'OPERATOR'] },
        });
      }

      return business;
    });

    this.events.emit('business.applied', { businessId: result.id, userId });
    return result;
  }

  async updateProfile(userId: string, dto: UpdateBusinessProfileDto) {
    const biz = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
    });
    if (!biz) throw new NotFoundException('Business profile not found');

    await this.assertOwnerOrManager(userId, biz.id);

    const updated = await this.prisma.businessProfile.update({
      where: { id: biz.id },
      data: { ...dto, businessType: undefined } as any,
    });

    // Check auto-approval
    if (updated.status === 'PENDING_DOCS' && this.checkAutoApproval(updated)) {
      const approved = await this.prisma.businessProfile.update({
        where: { id: updated.id },
        data: { status: 'APPROVED', autoApprovedAt: new Date() },
      });
      this.events.emit('business.auto_approved', { businessId: approved.id, userId });
      this.events.emit('business.documents_complete', { businessId: approved.id });
      return approved;
    }

    return updated;
  }

  async uploadDocument(
    userId: string,
    documentType: 'logo' | 'coverPhoto' | 'commercialRegDoc' | 'taxCard' | 'photo',
    buffer: Buffer,
    mimetype: string,
  ) {
    const biz = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
    });
    if (!biz) throw new NotFoundException('Business profile not found');
    await this.assertOwnerOrManager(userId, biz.id);

    const result = await this.uploads.uploadFile(buffer, mimetype, 'business_docs');
    const url = result.url;

    const updateData: any = {};
    switch (documentType) {
      case 'logo':
        updateData.logoUrl = url;
        break;
      case 'coverPhoto':
        updateData.coverPhotoUrl = url;
        break;
      case 'commercialRegDoc':
        updateData.commercialRegDocUrl = url;
        break;
      case 'taxCard':
        updateData.taxCard = url;
        break;
      case 'photo':
        if (biz.photosUrls.length >= 20) {
          throw new BadRequestException('Maximum 20 photos allowed');
        }
        updateData.photosUrls = [...biz.photosUrls, url];
        break;
    }

    const updated = await this.prisma.businessProfile.update({
      where: { id: biz.id },
      data: updateData,
    });

    // Check auto-approval after doc upload
    if (updated.status === 'PENDING_DOCS' && this.checkAutoApproval(updated)) {
      const approved = await this.prisma.businessProfile.update({
        where: { id: updated.id },
        data: { status: 'APPROVED', autoApprovedAt: new Date() },
      });
      this.events.emit('business.auto_approved', { businessId: approved.id, userId });
      return { ...approved, uploadedUrl: url };
    }

    return { ...updated, uploadedUrl: url };
  }

  async createBranch(userId: string, dto: CreateBranchDto) {
    const biz = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
    });
    if (!biz) throw new NotFoundException('Business profile not found');
    await this.assertOwnerOrManager(userId, biz.id);

    return this.prisma.businessBranch.create({
      data: {
        businessId: biz.id,
        ...dto,
      },
    });
  }

  async getMyBusiness(userId: string) {
    // Check if user is owner or team member
    const asMember = await this.prisma.teamMember.findFirst({
      where: { userId, status: { not: 'REMOVED' } },
      include: { business: true },
    });
    if (!asMember) throw new NotFoundException('No business membership found');

    const biz = await this.prisma.businessProfile.findUnique({
      where: { id: asMember.businessId },
      include: {
        branches: true,
        teamMembers: {
          where: { status: { not: 'REMOVED' } },
          include: { user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, email: true } } },
        },
      },
    });

    return { business: biz, myMembership: asMember };
  }

  async getPublicBusiness(businessId: string) {
    const biz = await this.prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: {
        branches: { where: { isActive: true } },
        teamMembers: {
          where: { status: 'ACTIVE' },
          take: 5,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          },
        },
      },
    });
    if (!biz) throw new NotFoundException('Business not found');

    // Return public subset
    return {
      id: biz.id,
      businessName: biz.businessName,
      businessType: biz.businessType,
      description: biz.description,
      logoUrl: biz.logoUrl,
      coverPhotoUrl: biz.coverPhotoUrl,
      photosUrls: biz.photosUrls,
      primaryCity: biz.primaryCity,
      primaryAddress: biz.primaryAddress,
      primaryLat: biz.primaryLat,
      primaryLng: biz.primaryLng,
      servicesJson: biz.servicesJson,
      averageRating: biz.averageRating,
      totalBookings: biz.totalBookings,
      status: biz.status,
      branches: biz.branches,
      teamPreview: biz.teamMembers.map((m) => ({
        id: m.id,
        providerType: m.providerType,
        role: m.role,
        user: m.user,
      })),
      teamCount: await this.prisma.teamMember.count({
        where: { businessId, status: 'ACTIVE' },
      }),
    };
  }

  async searchBusinesses(city?: string, type?: string, page = 1) {
    const where: any = { status: 'APPROVED' };
    if (city) where.primaryCity = { contains: city, mode: 'insensitive' };
    if (type) where.businessType = type;

    const [items, total] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where,
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        orderBy: { averageRating: 'desc' },
        select: {
          id: true,
          businessName: true,
          businessType: true,
          logoUrl: true,
          description: true,
          primaryCity: true,
          averageRating: true,
          totalBookings: true,
          servicesJson: true,
          _count: { select: { teamMembers: { where: { status: 'ACTIVE' } } } },
          branches: { where: { isActive: true }, select: { id: true, city: true } },
        },
      }),
      this.prisma.businessProfile.count({ where }),
    ]);

    return {
      items: items.map((b) => ({
        ...b,
        teamCount: b._count.teamMembers,
        branchCount: b.branches.length,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  // ── Part C: Team Management ──────────────────────────────────────────────────

  async createInvite(userId: string, businessId: string, dto: CreateTeamInviteDto) {
    await this.assertOwnerOrManager(userId, businessId);

    const inviteCode = this.generateInviteCode();
    const inviteLinkUrl = `https://pawmateegypt.com/join-team/${inviteCode}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await this.prisma.teamInvite.create({
      data: {
        businessId,
        inviteCode,
        inviteLinkUrl,
        invitedEmail: dto.email,
        invitedPhone: dto.phone,
        invitedName: dto.name,
        targetRole: (dto.targetRole ?? 'PROVIDER') as any,
        targetProviderType: (dto.targetProviderType ?? 'PETFRIEND') as any,
        createdBy: userId,
        expiresAt,
      },
    });

    // Send invite email if email provided
    if (dto.email) {
      const biz = await this.prisma.businessProfile.findUnique({ where: { id: businessId } });
      await this.mail.sendTeamInvite(
        { email: dto.email, name: dto.name ?? '' },
        biz?.businessName ?? 'PawMate Business',
        inviteLinkUrl,
      );
    }

    this.events.emit('team.invite_sent', { businessId, inviteCode, invitedEmail: dto.email });
    return invite;
  }

  async directCreateMember(userId: string, businessId: string, dto: DirectCreateTeamMemberDto) {
    await this.assertOwnerOrManager(userId, businessId);

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists. Use the invite flow instead.');
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const providerRole = dto.targetProviderType === 'TRAINER' ? 'TRAINER' : 'PETFRIEND';
      const newUser = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          roles: ['PARENT', providerRole],
          isParent: true,
          isPetFriend: providerRole === 'PETFRIEND',
          activeRole: providerRole === 'PETFRIEND' ? 'petfriend' : 'trainer',
          emailVerified: false,
        },
      });

      // Create provider profile
      let providerProfileId: string | undefined;
      if (providerRole === 'PETFRIEND') {
        const profile = await tx.petFriendProfile.create({
          data: {
            userId: newUser.id,
            addressCity: dto.city,
            status: 'APPROVED', // team members auto-approved
          },
        });
        providerProfileId = profile.id;
      } else {
        const profile = await tx.trainerProfile.create({
          data: {
            userId: newUser.id,
            city: dto.city,
            specialties: dto.specialties ?? [],
            status: 'APPROVED', // team members auto-approved
          },
        });
        providerProfileId = profile.id;
      }

      // Create team membership
      const member = await tx.teamMember.create({
        data: {
          businessId,
          userId: newUser.id,
          role: (dto.targetRole ?? 'PROVIDER') as any,
          providerType: providerRole as any,
          providerProfileId,
          status: 'ACTIVE',
        },
      });

      return { user: newUser, member, providerProfileId };
    });

    // Send welcome email with credentials
    const biz = await this.prisma.businessProfile.findUnique({ where: { id: businessId } });
    await this.mail.sendTeamWelcomeWithCredentials(
      { email: dto.email, firstName: dto.firstName },
      biz?.businessName ?? 'PawMate Business',
      tempPassword,
    );

    this.events.emit('team.member_direct_created', {
      businessId,
      userId: result.user.id,
      memberId: result.member.id,
    });

    return {
      member: result.member,
      userId: result.user.id,
      email: dto.email,
      tempPasswordSent: true,
    };
  }

  async joinTeam(userId: string, inviteCode: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { inviteCode },
      include: { business: true },
    });

    if (!invite) throw new NotFoundException('Invalid invite code');
    if (invite.status !== 'PENDING') throw new BadRequestException('This invite is no longer valid');
    if (invite.expiresAt < new Date()) {
      await this.prisma.teamInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('This invite has expired');
    }

    // Check if already a member
    const existingMember = await this.prisma.teamMember.findUnique({
      where: { businessId_userId: { businessId: invite.businessId, userId } },
    });
    if (existingMember && existingMember.status !== 'REMOVED') {
      throw new ConflictException('You are already a member of this business');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Create provider profile if user doesn't have one yet
      const providerType = invite.targetProviderType;
      let providerProfileId: string | undefined;

      if (providerType === 'PETFRIEND') {
        const existing = await tx.petFriendProfile.findUnique({ where: { userId } });
        if (!existing) {
          const profile = await tx.petFriendProfile.create({
            data: { userId, status: 'APPROVED' },
          });
          providerProfileId = profile.id;
        } else {
          providerProfileId = existing.id;
        }
      } else {
        const existing = await tx.trainerProfile.findUnique({ where: { userId } });
        if (!existing) {
          const profile = await tx.trainerProfile.create({
            data: { userId, status: 'APPROVED' },
          });
          providerProfileId = profile.id;
        } else {
          providerProfileId = existing.id;
        }
      }

      // Add provider role to user if not present
      const user = await tx.user.findUnique({ where: { id: userId } });
      const roleName = providerType === 'PETFRIEND' ? 'PETFRIEND' : 'TRAINER';
      if (user && !user.roles.includes(roleName)) {
        await tx.user.update({
          where: { id: userId },
          data: { roles: [...user.roles, roleName] },
        });
      }

      // Create or re-activate membership
      let member;
      if (existingMember) {
        member = await tx.teamMember.update({
          where: { id: existingMember.id },
          data: {
            status: 'ACTIVE',
            role: invite.targetRole,
            providerType: invite.targetProviderType,
            providerProfileId,
            removedAt: null,
            joinedAt: new Date(),
          },
        });
      } else {
        member = await tx.teamMember.create({
          data: {
            businessId: invite.businessId,
            userId,
            role: invite.targetRole,
            providerType: invite.targetProviderType,
            providerProfileId,
            status: 'ACTIVE',
          },
        });
      }

      // Mark invite as used
      await tx.teamInvite.update({
        where: { id: invite.id },
        data: { status: 'USED', usedAt: new Date(), usedByUserId: userId },
      });

      return member;
    });

    this.events.emit('team.member_joined', {
      businessId: invite.businessId,
      userId,
      memberId: result.id,
    });

    return result;
  }

  async getTeamList(userId: string, businessId: string, filters?: { status?: string; providerType?: string }) {
    const member = await this.assertBusinessMember(userId, businessId);

    const where: any = { businessId };
    if (filters?.status) where.status = filters.status;
    if (filters?.providerType) where.providerType = filters.providerType;

    const isOwnerOrManager = ['OWNER', 'MANAGER'].includes(member.role);

    const members = await this.prisma.teamMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePhoto: true,
            email: isOwnerOrManager,
            phone: isOwnerOrManager,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const invites = isOwnerOrManager
      ? await this.prisma.teamInvite.findMany({
          where: { businessId, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return { members, invites };
  }

  async updateTeamMember(
    userId: string,
    businessId: string,
    memberId: string,
    dto: UpdateTeamMemberDto,
  ) {
    await this.assertOwnerOrManager(userId, businessId);

    const target = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!target || target.businessId !== businessId) {
      throw new NotFoundException('Team member not found');
    }
    if (target.role === 'OWNER') {
      throw new ForbiddenException('Cannot modify the OWNER role member');
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: dto,
    });
  }

  async suspendTeamMember(userId: string, businessId: string, memberId: string, dto: SuspendTeamMemberDto) {
    await this.assertOwnerOrManager(userId, businessId);

    const target = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!target || target.businessId !== businessId) throw new NotFoundException('Team member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot suspend the OWNER');

    const updated = await this.prisma.teamMember.update({
      where: { id: memberId },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: dto.reason,
      },
    });

    this.events.emit('team.member_suspended', {
      businessId,
      memberId,
      userId: target.userId,
      reason: dto.reason,
    });

    return updated;
  }

  async removeTeamMember(userId: string, businessId: string, memberId: string) {
    await this.assertOwnerOrManager(userId, businessId);

    const target = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!target || target.businessId !== businessId) throw new NotFoundException('Team member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot remove the OWNER');

    const updated = await this.prisma.teamMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED', removedAt: new Date() },
    });

    this.events.emit('team.member_removed', { businessId, memberId, userId: target.userId });
    return updated;
  }

  async leaveTeam(userId: string, membershipId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: membershipId },
    });
    if (!member || member.userId !== userId) throw new NotFoundException('Membership not found');
    if (member.role === 'OWNER') throw new ForbiddenException('The business owner cannot leave. Transfer ownership first.');

    const updated = await this.prisma.teamMember.update({
      where: { id: membershipId },
      data: { status: 'REMOVED', removedAt: new Date() },
    });

    this.events.emit('team.member_left', {
      businessId: member.businessId,
      memberId: membershipId,
      userId,
    });

    return updated;
  }

  async revokeInvite(userId: string, businessId: string, inviteId: string) {
    await this.assertOwnerOrManager(userId, businessId);

    const invite = await this.prisma.teamInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.businessId !== businessId) throw new NotFoundException('Invite not found');
    if (invite.status !== 'PENDING') throw new BadRequestException('Only pending invites can be revoked');

    return this.prisma.teamInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });
  }

  async getMyMemberships(userId: string) {
    return this.prisma.teamMember.findMany({
      where: { userId, status: { not: 'REMOVED' } },
      include: {
        business: {
          select: { id: true, businessName: true, logoUrl: true, businessType: true },
        },
      },
    });
  }

  // ── Admin Endpoints ──────────────────────────────────────────────────────────

  async getPendingReview() {
    return this.prisma.businessProfile.findMany({
      where: { status: { in: ['ADMIN_REVIEW', 'PENDING_DOCS'] } },
      orderBy: { appliedAt: 'asc' },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async reviewBusiness(businessId: string, dto: AdminReviewBusinessDto) {
    const biz = await this.prisma.businessProfile.findUnique({ where: { id: businessId } });
    if (!biz) throw new NotFoundException('Business not found');

    const data: any = { adminReviewedAt: new Date() };
    switch (dto.action) {
      case 'approve':
        data.status = 'APPROVED';
        break;
      case 'reject':
        if (!dto.reason) throw new BadRequestException('Reason required for rejection');
        data.status = 'REJECTED';
        break;
      case 'request_review':
        data.status = 'ADMIN_REVIEW';
        break;
    }

    const updated = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data,
    });

    if (dto.action === 'reject') {
      this.events.emit('business.rejected', { businessId, reason: dto.reason });
    }

    return updated;
  }

  async suspendBusiness(businessId: string) {
    const updated = await this.prisma.businessProfile.update({
      where: { id: businessId },
      data: { status: 'SUSPENDED' },
    });
    this.events.emit('business.suspended', { businessId });
    return updated;
  }

  async reinstateBusiness(businessId: string) {
    return this.prisma.businessProfile.update({
      where: { id: businessId },
      data: { status: 'APPROVED' },
    });
  }
}
