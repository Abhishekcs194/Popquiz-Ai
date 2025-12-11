// This service uses BroadcastChannel to simulate multiplayer across tabs/windows
// In a real production app, this would be a WebSocket connection.

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
  private channel: BroadcastChannel | null = null;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;

  connect(roomId: string, onMessage: (msg: NetworkMessage) => void) {
    if (this.channel) {
      this.channel.close();
    }
    this.channel = new BroadcastChannel(`popquiz-${roomId}`);
    this.onMessageCallback = onMessage;
    
    this.channel.onmessage = (event) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(event.data);
      }
    };
  }

  send(msg: NetworkMessage) {
    if (this.channel) {
      this.channel.postMessage(msg);
    }
  }

  disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

export const multiplayer = new MultiplayerService();
