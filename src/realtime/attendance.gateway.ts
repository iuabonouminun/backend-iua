import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Une "room" Socket.IO par séance (nommée d'après l'id de la ClassSession).
 * Le chef de classe rejoint la room de la séance affichée à l'écran ;
 * chaque scan réussi déclenche une mise à jour du compteur de présents
 * pour tout le monde dans cette room, sans rechargement.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class AttendanceGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('join-session')
  handleJoinSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(sessionId);
  }

  @SubscribeMessage('leave-session')
  handleLeaveSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(sessionId);
  }

  emitPresenceUpdate(sessionId: string, presentCount: number) {
    this.server?.to(sessionId).emit('presence-update', { presentCount });
  }

  emitSessionClosed(sessionId: string) {
    this.server?.to(sessionId).emit('session-closed');
  }
}
