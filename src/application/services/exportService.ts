import { Message, Room } from '../../domain/models';

export const exportChatToHTML = (room: Room, messages: Message[], userId: string) => {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Exported Chat: ${room.name}</title>
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f9fafb; }
        .message { margin-bottom: 15px; padding: 10px; border-radius: 8px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .sender { font-weight: bold; color: #374151; margin-bottom: 4px; }
        .time { font-size: 0.8em; color: #9ca3af; }
        .text { color: #111827; white-space: pre-wrap; }
        .me { background: #eff6ff; border-left: 4px solid #3b82f6; }
        .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${room.name}</h1>
        <p>Exported on: ${new Date().toLocaleString()}</p>
        <p><em>End-to-End Encrypted Chat Log</em></p>
      </div>
  `;

  for (const msg of messages) {
    const isMe = msg.senderId === userId;
    const senderName = isMe ? 'Me' : msg.senderId;
    const time = new Date(msg.timestamp).toLocaleString();
    
    let content = msg.text;
    if (msg.type === 'file') {
      content = `
        <div class="file-attachment">
          📎 <strong>File:</strong> <a href="${msg.fileUrl}" target="_blank">${msg.fileName}</a>
          <br><small><em>(Encrypted file, requires decryption key to open)</em></small>
        </div>
      `;
    }
    
    html += `
      <div class="message ${isMe ? 'me' : ''}">
        <div class="sender">${senderName} <span class="time">${time}</span></div>
        <div class="text">${content}</div>
      </div>
    `;
  }

  html += `</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-export-${room.name.replace(/\s+/g, '-')}.html`;
  a.click();
  URL.revokeObjectURL(url);
};
