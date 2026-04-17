import { randomUUID } from 'crypto';
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

  // FIX 14: Replace Date.now() with randomUUID() to avoid ID collisions
  @SubscribeMessage('chat:send')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; message: string },
  ) {
    const userId = client.data.userId;
    this.server.to(`booking:${data.conversationId}`).emit('chat:message', {
      id: randomUUID(),
      senderId: userId,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
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
