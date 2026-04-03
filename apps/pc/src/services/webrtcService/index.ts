import { invoke } from '@tauri-apps/api/core';
import { nanoid } from 'nanoid';
import { WebRTCSignalMessage, WebRTCConfig } from '@workspace/types';

const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
};

const createWebRTCConfig = (): RTCConfiguration => {
  return {
    ...DEFAULT_WEBRTC_CONFIG,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
  };
};

class WebRTCService {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  public sessionId: string;
  private localUserId: string;
  private onMessageCallback: ((friendId: string, message: string) => void) | null = null;
  private onConnectionStateChange: ((friendId: string, state: RTCPeerConnectionState) => void) | null = null;

  constructor(localUserId: string) {
    this.localUserId = localUserId;
    this.sessionId = nanoid();
  }

  setOnMessageCallback(callback: (friendId: string, message: string) => void) {
    this.onMessageCallback = callback;
  }

  setOnConnectionStateChange(callback: (friendId: string, state: RTCPeerConnectionState) => void) {
    this.onConnectionStateChange = callback;
  }

  async createConnection(friendId: string): Promise<RTCPeerConnection> {
    const config = createWebRTCConfig();
    const connection = new RTCPeerConnection(config);

    this.connections.set(friendId, connection);

    connection.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidateType = event.candidate.type;
        if (candidateType === 'relay') {
          console.log('Skipping relay candidate');
          return;
        }

        const signalMessage: WebRTCSignalMessage = {
          type: 'candidate',
          sender: this.localUserId,
          receiver: friendId,
          sessionId: this.sessionId,
          data: event.candidate.toJSON(),
          timestamp: Date.now(),
        };

        await this.sendSignal(signalMessage);
      }
    };

    connection.onconnectionstatechange = () => {
      console.log(`Connection state: ${connection.connectionState}`);
      this.onConnectionStateChange?.(friendId, connection.connectionState);
    };

    connection.ondatachannel = (event) => {
      console.log('Received data channel:', event.channel.label);
      this.setupDataChannel(friendId, event.channel);
    };

    return connection;
  }

  async createOffer(friendId: string): Promise<RTCSessionDescriptionInit> {
    let connection = this.connections.get(friendId);
    if (!connection) {
      connection = await this.createConnection(friendId);
    }

    const dataChannel = connection.createDataChannel('webrtc-chat', {
      ordered: true,
    });
    this.setupDataChannel(friendId, dataChannel);

    const offer = await connection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await connection.setLocalDescription(offer);

    return offer;
  }

  async handleOffer(friendId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    let connection = this.connections.get(friendId);
    if (!connection) {
      connection = await this.createConnection(friendId);
    }

    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    return answer;
  }

  async handleAnswer(friendId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const connection = this.connections.get(friendId);
    if (!connection) {
      throw new Error('No connection found for friend');
    }

    await connection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleCandidate(friendId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const connection = this.connections.get(friendId);
    if (!connection) {
      throw new Error('No connection found for friend');
    }

    const iceCandidate = new RTCIceCandidate(candidate);
    if (iceCandidate.type === 'relay') {
      console.log('Skipping relay candidate');
      return;
    }

    await connection.addIceCandidate(iceCandidate);
  }

  private setupDataChannel(friendId: string, channel: RTCDataChannel) {
    this.dataChannels.set(friendId, channel);

    channel.onopen = () => {
      console.log(`Data channel opened for ${friendId}`);
    };

    channel.onclose = () => {
      console.log(`Data channel closed for ${friendId}`);
      this.dataChannels.delete(friendId);
    };

    channel.onmessage = (event) => {
      console.log(`Received message from ${friendId}:`, event.data);
      this.onMessageCallback?.(friendId, event.data);
    };

    channel.onerror = (error) => {
      console.error(`Data channel error for ${friendId}:`, error);
    };
  }

  sendMessage(friendId: string, message: string): boolean {
    const channel = this.dataChannels.get(friendId);
    if (!channel || channel.readyState !== 'open') {
      console.error('Data channel is not open');
      return false;
    }

    channel.send(message);
    return true;
  }

  async sendSignal(signalMessage: WebRTCSignalMessage): Promise<void> {
    try {
      const raw = JSON.stringify(signalMessage);
      await invoke('send_text_msg', {
        textQuicMsg: {
          nano_id: nanoid(),
          text_type: 100,
          raw: raw,
          recv_user: signalMessage.receiver,
          send_user: signalMessage.sender,
          timestamp: signalMessage.timestamp,
        },
      });
    } catch (error) {
      console.error('Failed to send signal:', error);
      throw error;
    }
  }

  async closeConnection(friendId: string): Promise<void> {
    const channel = this.dataChannels.get(friendId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(friendId);
    }

    const connection = this.connections.get(friendId);
    if (connection) {
      connection.close();
      this.connections.delete(friendId);
    }
  }

  closeAllConnections(): void {
    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();

    this.connections.forEach((connection) => connection.close());
    this.connections.clear();
  }

  getConnectionState(friendId: string): RTCPeerConnectionState | null {
    const connection = this.connections.get(friendId);
    return connection?.connectionState || null;
  }

  isDataChannelOpen(friendId: string): boolean {
    const channel = this.dataChannels.get(friendId);
    return channel?.readyState === 'open';
  }
}

let webRTCServiceInstance: WebRTCService | null = null;

export const initWebRTCService = (localUserId: string): WebRTCService => {
  if (!webRTCServiceInstance) {
    webRTCServiceInstance = new WebRTCService(localUserId);
  }
  return webRTCServiceInstance;
};

export const getWebRTCService = (): WebRTCService | null => {
  return webRTCServiceInstance;
};

export { WebRTCService };
