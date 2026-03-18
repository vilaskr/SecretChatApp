import React from 'react';
import { Message } from '../../../domain/models';
import { format } from 'date-fns';
import { Clock, Check } from 'lucide-react';
import { cn } from '../ui/Button';

interface ChatBubbleProps {
  message: Message;
  isMe: boolean;
  showSender: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isMe, showSender }) => {
  return (
    <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
      {!isMe && showSender && (
        <span className="text-xs text-stone-500 ml-2 mb-1.5 font-medium tracking-wide">
          {message.senderId.substring(0, 6)}...
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-sm",
          isMe
            ? "bg-stone-800 text-stone-50 rounded-br-sm"
            : "bg-white border border-stone-200 text-stone-800 rounded-bl-sm"
        )}
      >
        {message.text}
      </div>
      <span className="text-[11px] text-stone-400 mt-1.5 mx-2 flex items-center font-medium tracking-wider">
        {format(message.timestamp, 'h:mm a')}
        {isMe && (
          <span className="ml-1.5 opacity-60">
            {message.status === 'pending' || message.status === 'sending' ? (
              <Clock className="w-3 h-3" />
            ) : message.status === 'error' ? (
              <span className="text-red-500">Failed</span>
            ) : (
              <Check className="w-3 h-3 text-stone-500" />
            )}
          </span>
        )}
      </span>
    </div>
  );
};
