import React, { useState } from 'react';
import { Message } from '../../../domain/models';
import { Reply, Smile, Paperclip, Download, Loader2 } from 'lucide-react';
import { LinkPreview } from './LinkPreview';
import { decryptFile } from '../../../infrastructure/crypto/encryptionService';

interface MessageEntryProps {
  message: Message;
  senderName: string;
  isSender: boolean;
  isGrouped: boolean;
  repliedMessage?: Message;
  repliedMessageSenderName?: string;
  reactions: Record<string, number>;
  userReactions?: string[];
  onReply: (msg: Message) => void;
  onReact: (msgId: string, reaction: string) => void;
  roomKey?: CryptoKey;
}

export function MessageEntry({
  message,
  senderName,
  isSender,
  isGrouped,
  repliedMessage,
  repliedMessageSenderName,
  reactions,
  userReactions = [],
  onReply,
  onReact,
  roomKey
}: MessageEntryProps) {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const timeString = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleReact = (e: React.MouseEvent, reaction: string) => {
    e.stopPropagation();
    onReact(message.id, reaction);
  };

  const handleDownloadFile = async () => {
    if (!message.fileUrl || !message.fileIv || !roomKey || downloadProgress !== null || isDecrypting) return;
    
    try {
      setDownloadProgress(0);
      const response = await fetch(message.fileUrl);
      
      if (!response.body) throw new Error('No response body');
      
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        if (total) {
          setDownloadProgress(Math.round((loaded / total) * 100));
        }
      }
      
      setDownloadProgress(null);
      setIsDecrypting(true);
      
      const encryptedData = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        encryptedData.set(chunk, offset);
        offset += chunk.length;
      }
      
      const iv = message.fileIv;
      const decryptedData = await decryptFile(encryptedData.buffer, iv, roomKey);
      
      const blob = new Blob([decryptedData], { type: message.fileType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = message.fileName || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download/decrypt file", e);
      setDownloadProgress(null);
    } finally {
      setIsDecrypting(false);
    }
  };

  // Simple URL detection
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = message.text.split(urlRegex);
  const url = message.text.match(urlRegex)?.[0];

  return (
    <div id={`msg-${message.id}`} className={`group relative py-2 flex ${isSender ? 'justify-end' : 'justify-start'} snap-start animate-fade-in`} style={{ scrollSnapStop: 'always' }}>
      <div className={`max-w-[80%] ${isSender ? 'items-end' : 'items-start'} flex flex-col relative`}>
        
        {/* Actions Menu (Hover) */}
        <div className={`absolute top-2 ${isSender ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 bg-white shadow-sm border border-stone-200 rounded-lg p-1 z-20`}>
          <button onClick={() => onReply(message)} className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors" title="Reply">
            <Reply className="w-4 h-4" />
          </button>
          <div className="relative group/emoji">
            <button className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors" title="React">
              <Smile className="w-4 h-4" />
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/emoji:flex bg-white shadow-md border border-stone-200 rounded-lg p-1 space-x-1 z-50">
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                <button
                  key={emoji}
                  onClick={(e) => handleReact(e, emoji)}
                  className="p-1.5 hover:bg-stone-100 rounded-md text-lg transition-transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Reply Preview */}
        {repliedMessage && (
          <div 
            className="mb-1 ml-1 pl-2 border-l-2 border-stone-300 text-xs text-stone-500 cursor-pointer hover:text-stone-700 transition-colors italic"
            onClick={() => {
              const el = document.getElementById(`msg-${repliedMessage.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <span className="font-medium mr-1">{repliedMessageSenderName}:</span>
            <span className="truncate inline-block align-bottom max-w-[150px] font-handwriting">
              {repliedMessage.text}
            </span>
          </div>
        )}

        {/* Message Header (Name & Time) */}
        {!isGrouped && (
          <div className={`flex items-baseline space-x-2 mb-0.5 ${isSender ? 'flex-row-reverse space-x-reverse' : ''}`}>
            <span className="font-semibold text-stone-800 text-sm">{senderName}</span>
            <span className="text-[10px] text-stone-400 font-medium tracking-wide">{timeString}</span>
          </div>
        )}

        {/* Message Content */}
        <div className={`font-handwriting text-lg sm:text-xl text-stone-900 leading-7 sm:leading-8 px-3 sm:px-4 py-2 rounded-2xl shadow-sm ${isSender ? 'bg-amber-100/70' : 'bg-stone-100/70'} break-words overflow-hidden`}>
          {url && <LinkPreview url={url} />}
          {message.type === 'file' && (
            <div className="mt-2">
              <button 
                onClick={handleDownloadFile} 
                className="flex items-center space-x-2 text-stone-700 underline group/file"
                disabled={downloadProgress !== null || isDecrypting}
              >
                {isDecrypting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : downloadProgress !== null ? (
                  <span className="text-xs font-mono">{downloadProgress}%</span>
                ) : (
                  <Download className="w-4 h-4 group-hover/file:scale-110 transition-transform" />
                )}
                <span className="max-w-[200px] truncate">{message.fileName}</span>
              </button>
              {(downloadProgress !== null || isDecrypting) && (
                <div className="mt-1 w-full bg-stone-200 rounded-full h-0.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${isDecrypting ? 'bg-emerald-500 animate-pulse w-full' : 'bg-stone-800'}`}
                    style={downloadProgress !== null ? { width: `${downloadProgress}%` } : {}}
                  />
                </div>
              )}
            </div>
          )}
          {parts.map((part, i) => 
            urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{part}</a> : part
          )}
        </div>

        {/* Read Receipts & Time for grouped messages */}
        {isSender && isGrouped && (
          <div className="flex justify-end items-center mt-0.5 space-x-1">
            <span className="text-[10px] text-stone-400 font-medium tracking-wide">{timeString}</span>
          </div>
        )}

        {/* Reactions */}
        {Object.keys(reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={(e) => handleReact(e, emoji)}
                className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  userReactions.includes(emoji)
                    ? 'bg-stone-200 text-stone-800' 
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
