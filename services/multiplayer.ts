// @ts-ignore
import { joinRoom } from 'trystero';

export type MessageType = 
  | 'JOIN_REQUEST' 
  | 'STATE_UPDATE' 
  | 'PLAYER_ACTION' 
  | 'HOST_ACTION';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  senderId?: string;
}

class MultiplayerService {
  private room: any = null;
  private sendAction: any = null;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;

  connect(roomId: string, onMessage: (msg: NetworkMessage) => void) {
    if (this.room) {
      this.disconnect();
    }

    console.log(`[Multiplayer] Joining room: ${roomId}`);
    // appId ensures we don't collide with other trystero apps
    this.room = joinRoom({ appId: 'popquiz-ai-v1' }, roomId);
    this.onMessageCallback = onMessage;

    // 'game' is the "topic" for our messages
    const [send, get] = this.room.makeAction('game');
    this.sendAction = send;

    // Listen for incoming data
    get((data: any, peerId: string) => {
      // data is the exact object we passed to send()
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    });

    this.room.onPeerJoin((peerId: string) => {
      console.log(`[Multiplayer] Peer joined: ${peerId}`);
    });
    
    this.room.onPeerLeave((peerId: string) => {
      console.log(`[Multiplayer] Peer left: ${peerId}`);
    });
  }

  send(msg: NetworkMessage) {
    if (this.sendAction) {
      // Trystero broadcasts to all peers by default
      this.sendAction(msg);
    }
  }

  disconnect() {
    if (this.room) {
      console.log('[Multiplayer] Leaving room');
      this.room.leave();
      this.room = null;
      this.sendAction = null;
    }
  }
}

export const multiplayer = new MultiplayerService();