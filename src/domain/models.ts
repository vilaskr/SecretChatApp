export interface User {
  uid: string;
  email: string;
  displayName: string;
  publicKey?: string;
  status?: 'online' | 'away' | 'offline';
  lastSeen?: number;
}

export interface Room {
  id: string;
  name: string;
  creatorId: string;
  isDirect: boolean;
  members: string[];
  roomKey: CryptoKey;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  timestamp: number;
  isSent: boolean;
  status: 'pending' | 'sending' | 'sent' | 'error';
  type?: 'text' | 'reaction' | 'file';
  replyToMessageId?: string;
  targetMessageId?: string;
  reaction?: string;
  reactions?: Record<string, string[]>;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileIv?: string;
}

export interface JoinRequest {
  id: string;
  publicKey: string;
  email: string;
  username: string;
}
