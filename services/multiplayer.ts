// @ts-ignore
import { joinRoom } from 'trystero';

export type MessageType = 
  | 'JOIN_REQUEST' 
  | 'STATE_UPDATE' 
  | 'PLAYER_ACTION' 
  | 'HOST_ACTION'
  | 'CHAT_MESSAGE'
  | 'PLAYER_UPDATE'
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
  private peerCheckInterval: number | null = null;

  connect(roomId: string, onMessage: (msg: NetworkMessage) => void) {
    // Only reconnect if roomId actually changed
    if (this.room && this.currentRoomId === roomId) {
      this.onMessageCallback = onMessage;
      return;
    }

    // Disconnect from previous room only if roomId changed
    if (this.room && this.currentRoomId !== roomId) {
      this.disconnect();
    }

    this.currentRoomId = roomId;
    this.isConnected = false;
    this.peerIds.clear();
    this.reconnectAttempts = 0;
    this.onMessageCallback = onMessage;
    
    try {
      // appId ensures we don't collide with other trystero apps
      // Trystero uses IPFS by default for signaling
      this.room = joinRoom({ appId: 'popquiz-ai-v1' }, roomId);
      
      // Set connection timeout (20 seconds - P2P WebRTC can take time to establish)
      this.connectionTimeout = window.setTimeout(() => {
        if (!this.isConnected || this.peerIds.size === 0) {
          console.warn(`[Multiplayer] Connection timeout for room: ${roomId} (connected: ${this.isConnected}, peers: ${this.peerIds.size})`);
          console.warn(`[Multiplayer] P2P connection may be blocked by firewall/NAT. Messages may still work if Trystero can establish connection.`);
        }
      }, 20000);

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

        // Track peer - receiving ANY message means we're connected
        if (peerId) {
          this.peerIds.add(peerId);
          this.isConnected = true;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
        }

        // Handle ping/pong for connection health
        if (data.type === 'PING') {
          this.send({ type: 'PONG', payload: {}, senderId: data.senderId, timestamp: Date.now() });
          return;
        }

        if (data.type === 'PONG') {
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
        this.peerIds.add(peerId);
        this.isConnected = true;
        
        // Clear timeout on successful peer connection
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }

        // Notify that connection is ready (for App.tsx to broadcast state)
        if (this.onMessageCallback) {
          setTimeout(() => {
            if ((window as any).__onPeerConnected) {
              (window as any).__onPeerConnected(peerId);
            }
          }, 100);
        }

        // Send ping to verify connection
        setTimeout(() => {
          this.send({ type: 'PING', payload: {}, timestamp: Date.now() });
        }, 500);
      });

      // Actively check for peers using Trystero's getPeers() method
      this.peerCheckInterval = window.setInterval(() => {
        try {
          let peers: string[] = [];
          
          if (typeof this.room.getPeers === 'function') {
            peers = this.room.getPeers();
          } else if (this.room.peers && Array.isArray(this.room.peers)) {
            peers = this.room.peers;
          } else if (this.room._peers && Array.isArray(this.room._peers)) {
            peers = this.room._peers;
          }
          
          if (peers && peers.length > 0) {
            peers.forEach((peerId: string) => {
              if (peerId && !this.peerIds.has(peerId)) {
                this.peerIds.add(peerId);
                this.isConnected = true;
                
                if (this.connectionTimeout) {
                  clearTimeout(this.connectionTimeout);
                  this.connectionTimeout = null;
                }
                
                // Trigger peer connected callback
                if ((window as any).__onPeerConnected) {
                  (window as any).__onPeerConnected(peerId);
                }
              }
            });
          }
        } catch (error) {
          // getPeers might not be available or accessible
        }
      }, 2000);
      
      this.room.onPeerLeave((peerId: string) => {
        this.peerIds.delete(peerId);
      });

      // Mark as connected after a delay - but only if we're the first peer (host)
      setTimeout(() => {
        if (!this.isConnected && this.peerIds.size === 0) {
          this.isConnected = true;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
        } else if (this.peerIds.size > 0) {
          this.isConnected = true;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
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
      console.warn('[Multiplayer] Cannot send message: sendAction not available');
      return false;
    }

    // For P2P, always try to send - Trystero queues messages and delivers when peers connect
    // This is critical: messages help establish the connection
    const isCriticalMessage = msg.type === 'JOIN_REQUEST' || msg.type === 'STATE_UPDATE' || msg.type === 'PLAYER_ACTION';
    
    // Log connection state for debugging
    if (!this.isConnected && !isCriticalMessage && msg.type !== 'PING' && msg.type !== 'PONG') {
      console.warn(`[Multiplayer] Connection not ready, but sending anyway (message will queue if needed)`);
    }

    try {
      // Always try to send - Trystero will queue messages and deliver when peers connect
      const messageToSend = { ...msg, timestamp: Date.now() };
      this.sendAction(messageToSend);
      
      // If this is a critical message and we have no peers, log a warning
      if (isCriticalMessage && this.peerIds.size === 0 && !this.isConnected) {
        console.warn(`[Multiplayer] Sending ${msg.type} but no peers detected yet - message may be queued`);
      }
      
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

    if (this.peerCheckInterval) {
      clearInterval(this.peerCheckInterval);
      this.peerCheckInterval = null;
    }

    if (this.room) {
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