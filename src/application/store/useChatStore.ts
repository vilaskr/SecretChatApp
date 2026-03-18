import { create } from 'zustand';
import { localDb } from '../../infrastructure/db/localDatabase';
import { Message, Room } from '../../domain/models';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../infrastructure/firebase/firebaseConfig';
import { encryptMessage } from '../../infrastructure/crypto/encryptionService';

interface SendMessageOptions {
  replyToMessageId?: string;
  type?: 'text' | 'reaction' | 'file';
  targetMessageId?: string;
  reaction?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileIv?: string;
}

interface ChatState {
  isOnline: boolean;
  sendMessage: (roomId: string, text: string, senderId: string, roomKey: CryptoKey, options?: SendMessageOptions) => Promise<void>;
  syncOfflineMessages: () => Promise<void>;
  setOnlineStatus: (status: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  isOnline: navigator.onLine,

  setOnlineStatus: (status) => {
    set({ isOnline: status });
    if (status) {
      get().syncOfflineMessages();
    }
  },

  sendMessage: async (roomId, text, senderId, roomKey, options = {}) => {
    const msgId = crypto.randomUUID();
    const timestamp = Date.now();
    const isOnline = get().isOnline;

    const payload = {
      type: options.type || 'text',
      text,
      replyToMessageId: options.replyToMessageId,
      targetMessageId: options.targetMessageId,
      reaction: options.reaction,
      fileUrl: options.fileUrl,
      fileName: options.fileName,
      fileType: options.fileType,
      fileIv: options.fileIv
    };

    const payloadString = JSON.stringify(payload);

    // 1. Optimistic local save
    const localMsg: Message = {
      id: msgId,
      roomId,
      senderId,
      text,
      timestamp,
      isSent: true,
      status: isOnline ? 'sending' : 'pending',
      type: payload.type as any,
      replyToMessageId: payload.replyToMessageId,
      targetMessageId: payload.targetMessageId,
      reaction: payload.reaction,
      fileUrl: payload.fileUrl,
      fileName: payload.fileName,
      fileType: payload.fileType,
      fileIv: payload.fileIv
    };
    
    await localDb.messages.put(localMsg);

    if (isOnline) {
      try {
        // 2. Encrypt and send
        const { ciphertext, iv } = await encryptMessage(payloadString, roomKey);
        await setDoc(doc(db, `rooms/${roomId}/messages/${msgId}`), {
          senderId,
          ciphertext,
          iv,
          timestamp
        });
        
        // 3. Mark as sent locally
        await localDb.messages.update(msgId, { status: 'sent' });
      } catch (error) {
        console.error("Failed to send message, queuing for retry", error);
        await localDb.messages.update(msgId, { status: 'error' });
      }
    }
  },

  syncOfflineMessages: async () => {
    // Find all pending/error messages and try to send them
    const pendingMessages = await localDb.messages
      .where('status')
      .anyOf(['pending', 'error'])
      .toArray();

    if (pendingMessages.length === 0) return;

    for (const msg of pendingMessages) {
      try {
        // We need the room key to encrypt. Fetch from local DB.
        const room = await localDb.rooms.get(msg.roomId);
        if (!room || !room.roomKey) continue;

        const payload = {
          type: msg.type || 'text',
          text: msg.text,
          replyToMessageId: msg.replyToMessageId,
          targetMessageId: msg.targetMessageId,
          reaction: msg.reaction,
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileType: msg.fileType,
          fileIv: msg.fileIv
        };
        const payloadString = JSON.stringify(payload);

        const { ciphertext, iv } = await encryptMessage(payloadString, room.roomKey);
        await setDoc(doc(db, `rooms/${msg.roomId}/messages/${msg.id}`), {
          senderId: msg.senderId,
          ciphertext,
          iv,
          timestamp: msg.timestamp
        });

        await localDb.messages.update(msg.id, { status: 'sent' });
      } catch (error) {
        console.error(`Failed to sync message ${msg.id}`, error);
      }
    }
  }
}));
