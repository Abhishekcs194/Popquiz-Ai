// @ts-ignore
import { joinRoom } from 'trystero';

export type MessageType = 
  | 'JOIN_REQUEST' 
  | 'STATE_UPDATE' 
  | 'PLAYER_ACTION' 
  | 'HOST_ACTION'
  | 'PING'
  | 'PONG';

export interface NetworkMessage {
  type: MessageType;
  payload: any;
  senderId?: string;
  timestamp?: number;
}

class MultiplayerService {
  private room: any = null;
  private sendAction: any = null;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;
  private isConnected: boolean = false;
  private connectionTimeout: number | null = null;
  private peerIds: Set<string> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private currentRoomId: string | null = null;

  connect(roomId: string, onMessage: (msg: NetworkMessage) => void) {
    if (this.room && this.currentRoomId === roomId) {
      console.log(`[Multiplayer] Already connected to room: ${roomId}`);
      return;
    }

    if (this.room) {
      this.disconnect();
    }

    this.currentRoomId = roomId;
    this.isConnected = false;
    this.peerIds.clear();
    this.reconnectAttempts = 0;
    this.onMessageCallback = onMessage;

    console.log(`[Multiplayer] Joining room: ${roomId}`);
    
    try {
      // appId ensures we don't collide with other trystero apps
      this.room = joinRoom({ appId: 'popquiz-ai-v1' }, roomId);
      
      // Set connection timeout (10 seconds)
      this.connectionTimeout = window.setTimeout(() => {
        if (!this.isConnected) {
          console.warn(`[Multiplayer] Connection timeout for room: ${roomId}`);
          this.handleConnectionFailure(roomId, onMessage);
        }
      }, 10000);

      // 'game' is the "topic" for our messages
      const [send, get] = this.room.makeAction('game');
      this.sendAction = send;

      // Listen for incoming data
      get((data: any, peerId: string) => {
        // Validate message structure
        if (!data || typeof data !== 'object') {
          console.warn(`[Multiplayer] Invalid message format from ${peerId}`);
          return;
        }

        // Track peer
        if (peerId) {
          this.peerIds.add(peerId);
        }

        // Handle ping/pong for connection health
        if (data.type === 'PING') {
          this.send({ type: 'PONG', payload: {}, senderId: data.senderId, timestamp: Date.now() });
          return;
        }

        if (data.type === 'PONG') {
          // Connection is healthy
          this.isConnected = true;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          return;
        }

        // Pass valid messages to callback
        if (this.onMessageCallback) {
          this.onMessageCallback({ ...data, timestamp: Date.now() });
        }
      });

      this.room.onPeerJoin((peerId: string) => {
        console.log(`[Multiplayer] Peer joined: ${peerId}`);
        this.peerIds.add(peerId);
        this.isConnected = true;
        
        // Clear timeout on successful peer connection
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }

        // Send ping to verify connection
        setTimeout(() => {
          this.send({ type: 'PING', payload: {}, timestamp: Date.now() });
        }, 500);
      });
      
      this.room.onPeerLeave((peerId: string) => {
        console.log(`[Multiplayer] Peer left: ${peerId}`);
        this.peerIds.delete(peerId);
      });

      // Mark as connected after a short delay (allows time for peer discovery)
      setTimeout(() => {
        if (!this.isConnected && this.peerIds.size === 0) {
          // If we're the first peer (host), mark as connected anyway
          this.isConnected = true;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          console.log(`[Multiplayer] Connected as first peer in room: ${roomId}`);
        }
      }, 2000);

    } catch (error) {
      console.error(`[Multiplayer] Connection error:`, error);
      this.handleConnectionFailure(roomId, onMessage);
    }
  }

  private handleConnectionFailure(roomId: string, onMessage: (msg: NetworkMessage) => void) {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff, max 10s
      console.log(`[Multiplayer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.disconnect();
        this.connect(roomId, onMessage);
      }, delay);
    } else {
      console.error(`[Multiplayer] Max reconnection attempts reached. Connection failed.`);
      this.isConnected = false;
    }
  }

  send(msg: NetworkMessage) {
    if (!this.sendAction) {
      console.warn('[Multiplayer] Cannot send message: not connected');
      return false;
    }

    if (!this.isConnected && msg.type !== 'PING' && msg.type !== 'PONG') {
      console.warn('[Multiplayer] Connection not ready, queuing message...');
      // Retry sending after a short delay
      setTimeout(() => {
        if (this.sendAction) {
          this.sendAction({ ...msg, timestamp: Date.now() });
        }
      }, 500);
      return false;
    }

    try {
      this.sendAction({ ...msg, timestamp: Date.now() });
      return true;
    } catch (error) {
      console.error('[Multiplayer] Error sending message:', error);
      return false;
    }
  }

  disconnect() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.room) {
      console.log('[Multiplayer] Leaving room');
      try {
        this.room.leave();
      } catch (error) {
        console.error('[Multiplayer] Error disconnecting:', error);
      }
      this.room = null;
      this.sendAction = null;
      this.isConnected = false;
      this.peerIds.clear();
      this.currentRoomId = null;
    }
  }

  getConnectionState() {
    return {
      isConnected: this.isConnected,
      peerCount: this.peerIds.size,
      roomId: this.currentRoomId
    };
  }
}

export const multiplayer = new MultiplayerService();