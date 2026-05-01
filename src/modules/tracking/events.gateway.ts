import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackingService } from './tracking.service';
import { ChatService } from '../chat/chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private trackingService: TrackingService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // FIX 3: join:user — verify caller's userId matches the requested userId
  @SubscribeMessage('join:user')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    const requestingUserId = client.data.userId;

    if (!requestingUserId || requestingUserId !== userId) {
      client.emit('error', { message: 'Access denied. You can only join your own user room.' });
      return;
    }

    client.join(`user:${userId}`);
    client.emit('joined', { room: `user:${userId}` });
  }

  // FIX 3: join:booking — verify caller is owner OR sitter of the booking
  @SubscribeMessage('join:booking')
  async handleJoinBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { bookingId: string },
  ) {
    const userId = client.data.userId;

    if (!userId || !payload?.bookingId) {
      client.emit('error', { message: 'Invalid request.' });
      return;
    }

    const booking = await this.prisma.booking.findFirst({
      where: {
        id: payload.bookingId,
        OR: [
          { parentId: userId },
          { petFriendId: userId },
        ],
      },
      select: { id: true },
    });

    if (!booking) {
      client.emit('error', { message: 'Access denied. You are not part of this booking.' });
      return;
    }

    client.join(`booking:${payload.bookingId}`);
    client.emit('joined', { bookingId: payload.bookingId });
  }

  @SubscribeMessage('leave:booking')
  handleLeaveBooking(@ConnectedSocket() client: Socket, @MessageBody() bookingId: string) {
    client.leave(`booking:${bookingId}`);
  }

  // FIX 3: join:walk — verify caller is owner OR sitter of the booking tied to the walk session
  @SubscribeMessage('join:walk')
  async handleJoinWalk(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const userId = client.data.userId;
    const sessionId = typeof payload === 'string' ? payload : payload?.sessionId;

    if (!userId || !sessionId) {
      client.emit('error', { message: 'Invalid request.' });
      return;
    }

    const session = await this.prisma.walkSession.findFirst({
      where: {
        id: sessionId,
        booking: {
          OR: [
            { parentId: userId },
            { petFriendId: userId },
          ],
        },
      },
      select: { id: true },
    });

    if (!session) {
      client.emit('error', { message: 'Access denied. You are not part of this walk session.' });
      return;
    }

    client.join(`walk:${sessionId}`);
    client.emit('joined', { sessionId });
  }

  @SubscribeMessage('leave:walk')
  handleLeaveWalk(@ConnectedSocket() client: Socket, @MessageBody() sessionId: string) {
    client.leave(`walk:${sessionId}`);
  }

  /**
   * walk:addPoint — sitter streams a single GPS point during a live walk.
   *
   * Persists to walk_tracking_points via TrackingService.addTrackingPoints
   * (which validates that the caller is the session's petFriend), then
   * broadcasts the latest point to the `walk:${sessionId}` room as
   * `walk:locationUpdate` so the parent's map updates in real time.
   *
   * Errors are surfaced to the emitter only (not broadcast) so private
   * details don't leak to the parent watching the walk.
   */
  @SubscribeMessage('walk:addPoint')
  async handleAddWalkPoint(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      sessionId: string;
      lat: number;
      lng: number;
      accuracyM?: number;
      speedMs?: number;
      altitudeM?: number;
      recordedAt?: string;
    },
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated.' });
      return;
    }
    if (!data?.sessionId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      client.emit('error', { message: 'walk:addPoint requires sessionId, lat, lng.' });
      return;
    }

    try {
      await this.trackingService.addTrackingPoints(data.sessionId, userId, [
        {
          lat: data.lat,
          lng: data.lng,
          accuracyM: data.accuracyM,
          speedMs: data.speedMs,
          altitudeM: data.altitudeM,
          recordedAt: data.recordedAt ?? new Date().toISOString(),
        } as any,
      ]);

      // Broadcast to the walk room so the parent + admin observers see the
      // update immediately. Private fields like fraud flags are NOT included
      // in the public payload.
      this.server.to(`walk:${data.sessionId}`).emit('walk:locationUpdate', {
        sessionId: data.sessionId,
        lat: data.lat,
        lng: data.lng,
        timestamp: data.recordedAt ?? new Date().toISOString(),
      });
    } catch (err: any) {
      this.logger.warn(
        `walk:addPoint failed for session ${data.sessionId}: ${err?.message ?? err}`,
      );
      client.emit('error', { message: err?.message ?? 'Could not record GPS point.' });
    }
  }

  /**
   * chat:send — receive a message from a connected client, persist it via
   * ChatService (which validates booking membership), then broadcast the
   * stored row to the booking room as `chat:message`.
   *
   * Accepts both the new shape `{ bookingId, content }` and the legacy
   * `{ conversationId, message }` so older clients keep working during
   * the rollout. The emitted payload includes BOTH `content` (canonical)
   * and `message` (legacy) so receivers on either codepath read the body.
   */
  @SubscribeMessage('chat:send')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      bookingId?: string;
      conversationId?: string;
      content?: string;
      message?: string;
    },
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated.' });
      return;
    }
    const bookingId = data?.bookingId ?? data?.conversationId;
    const content = data?.content ?? data?.message;
    if (!bookingId || !content) {
      client.emit('error', { message: 'chat:send requires bookingId + content.' });
      return;
    }

    try {
      const saved = await this.chatService.createMessage(bookingId, userId, content);

      this.server.to(`booking:${bookingId}`).emit('chat:message', {
        id: saved.id,
        bookingId: saved.bookingId,
        senderId: saved.senderId,
        senderRole: saved.senderRole,
        content: saved.content,
        // Legacy aliases — older mobile clients read these.
        message: saved.content,
        timestamp: saved.createdAt.toISOString(),
        createdAt: saved.createdAt.toISOString(),
      });
    } catch (err: any) {
      this.logger.warn(
        `chat:send failed for booking ${bookingId} by user ${userId}: ${err?.message ?? err}`,
      );
      // Surface only to the emitting socket — never broadcast errors to
      // the room (other party shouldn't see auth failures).
      client.emit('error', {
        message: err?.message ?? 'Could not send message.',
      });
    }
  }

  // Called by other services to emit events
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToBooking(bookingId: string, event: string, data: any) {
    this.server.to(`booking:${bookingId}`).emit(event, data);
  }

  emitWalkUpdate(sessionId: string, data: any) {
    this.server.to(`walk:${sessionId}`).emit('walk:locationUpdate', data);
  }
}
