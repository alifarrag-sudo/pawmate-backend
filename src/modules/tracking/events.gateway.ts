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

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwtService.verify(token);
      (client as any).userId = payload.sub;
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:user')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    client.join(`user:${userId}`);
  }

  @SubscribeMessage('join:booking')
  handleJoinBooking(@ConnectedSocket() client: Socket, @MessageBody() bookingId: string) {
    client.join(`booking:${bookingId}`);
  }

  @SubscribeMessage('leave:booking')
  handleLeaveBooking(@ConnectedSocket() client: Socket, @MessageBody() bookingId: string) {
    client.leave(`booking:${bookingId}`);
  }

  @SubscribeMessage('join:walk')
  handleJoinWalk(@ConnectedSocket() client: Socket, @MessageBody() sessionId: string) {
    client.join(`walk:${sessionId}`);
  }

  @SubscribeMessage('leave:walk')
  handleLeaveWalk(@ConnectedSocket() client: Socket, @MessageBody() sessionId: string) {
    client.leave(`walk:${sessionId}`);
  }

  @SubscribeMessage('chat:send')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; message: string },
  ) {
    const userId = (client as any).userId;
    this.server.to(`booking:${data.conversationId}`).emit('chat:message', {
      id: Date.now().toString(),
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
