import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateApprovalDto,
  GetApprovalsQueryDto,
  ResolveApprovalDto,
} from './dto/approvals.dto';

/**
 * Business logic for /admin/approvals.
 *
 * Each method assumes the caller has already passed the @Admin() guard
 * (JwtAuthGuard + AdminGuard) — i.e. request.user has roles containing
 * one of admin / owner / owner_restricted.
 *
 * Routing semantics:
 *   - 'ali_only'      → only an `owner` can resolve
 *   - 'ali_or_john'   → `owner` OR `owner_restricted` can resolve
 *   - everything else → admin / owner / owner_restricted can resolve
 *
 * `owner_restricted` (John) cannot resolve ali_only items. The service
 * enforces this; the controller does not need to know.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Convert the loose `status` query value into the canonical enum.
   * Accepts both upper-case (Prisma enum) and lower-case (web client) forms.
   */
  private normalizeStatus(input?: string): ApprovalStatus | undefined {
    if (!input) return undefined;
    const upper = input.toUpperCase();
    if (
      upper === ApprovalStatus.PENDING ||
      upper === ApprovalStatus.APPROVED ||
      upper === ApprovalStatus.REJECTED ||
      upper === ApprovalStatus.EXPIRED
    ) {
      return upper as ApprovalStatus;
    }
    return undefined;
  }

  async list(query: GetApprovalsQueryDto) {
    const where: Prisma.ApprovalWhereInput = {};
    const status = this.normalizeStatus(query.status);
    if (status) where.status = status;
    if (query.agentId) where.agentId = query.agentId;
    if (query.actionType) where.actionType = query.actionType;
    if (query.routing) where.routing = query.routing;

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const [items, total, pending] = await Promise.all([
      this.prisma.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.approval.count({ where }),
      this.prisma.approval.count({ where: { status: ApprovalStatus.PENDING } }),
    ]);

    return { data: items, total, pending };
  }

  async getById(id: string) {
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException({
        error: 'APPROVAL_NOT_FOUND',
        message: 'Approval not found.',
      });
    }
    return approval;
  }

  async create(dto: CreateApprovalDto) {
    const created = await this.prisma.approval.create({
      data: {
        agentId: dto.agentId,
        actionType: dto.actionType,
        payload: dto.payload as any,
        reasoning: dto.reasoning,
        routing: dto.routing ?? 'ali_or_john',
      },
    });

    this.eventEmitter.emit('approval.created', {
      approvalId: created.id,
      agentId: created.agentId,
      actionType: created.actionType,
      routing: created.routing,
      createdAt: created.createdAt.toISOString(),
    });

    this.logger.log(
      `Approval ${created.id} created (agent=${created.agentId}, action=${created.actionType}, routing=${created.routing})`,
    );

    return created;
  }

  /**
   * Resolve an approval. `resolverRoles` is the set of roles attached to
   * the JWT — the caller's identity is on the JWT and the controller passes
   * it through. We trust it because @Admin() already validated the token.
   */
  async resolve(
    id: string,
    dto: ResolveApprovalDto,
    resolver: { id: string; roles: string[] },
  ) {
    const existing = await this.getById(id);
    if (existing.status !== ApprovalStatus.PENDING) {
      throw new ConflictException({
        error: 'APPROVAL_ALREADY_RESOLVED',
        message: `Approval is already ${existing.status.toLowerCase()}.`,
      });
    }

    // Routing enforcement: ali_only items require the `owner` role.
    if (existing.routing === 'ali_only' && !resolver.roles.includes('owner')) {
      throw new ForbiddenException({
        error: 'ALI_ONLY_APPROVAL',
        message: 'Only Ali (owner) can resolve this approval.',
      });
    }

    const newStatus =
      dto.action === 'approved' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: newStatus,
        resolution: dto.action,
        comment: dto.comment ?? null,
        resolvedBy: resolver.id,
        resolvedAt: new Date(),
      },
    });

    this.eventEmitter.emit('approval.resolved', {
      approvalId: updated.id,
      action: dto.action,
      resolvedBy: resolver.id,
      agentId: updated.agentId,
      actionType: updated.actionType,
      routing: updated.routing,
      comment: updated.comment ?? null,
      resolvedAt: updated.resolvedAt?.toISOString(),
    });

    this.logger.log(
      `Approval ${updated.id} ${dto.action} by user ${resolver.id} (agent=${updated.agentId})`,
    );

    return updated;
  }
}
