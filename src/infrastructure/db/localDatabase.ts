import Dexie, { Table } from 'dexie';
import { Room, Message } from '../../domain/models';

export class LocalDatabase extends Dexie {
  rooms!: Table<Room, string>;
  messages!: Table<Message, string>;

  constructor() {
    super('PrivacyChatDB');
    this.version(1).stores({
      rooms: 'id, name, isDirect, *members',
      messages: 'id, roomId, senderId, timestamp, isSent, status'
    });
  }
}

export const localDb = new LocalDatabase();
