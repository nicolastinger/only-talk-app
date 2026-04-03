interface WebRTCSignalMessage {
  type: 'offer' | 'answer' | 'candidate';
  sender: string;
  receiver: string;
  sessionId: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

interface WebRTCSession {
  sessionId: string;
  friendId: string;
  connection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  isInitiator: boolean;
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

interface WebRTCConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
  bundlePolicy: RTCBundlePolicy;
}

interface WebRTCMessage {
  type: 'text' | 'file' | 'control';
  content: string;
  timestamp: number;
  sender: string;
}

export type {
  WebRTCSignalMessage,
  WebRTCSession,
  WebRTCConfig,
  WebRTCMessage,
};
