import React from 'react';
import { Message } from '../../../domain/models';
import { X } from 'lucide-react';

interface ReplyPreviewProps {
  message: Message;
  senderName: string;
  onCancel: () => void;
}

export function ReplyPreview({ message, senderName, onCancel }: ReplyPreviewProps) {
  return (
    <div className="flex items-center justify-between bg-stone-50 border-t border-stone-200 px-4 py-2 text-sm text-stone-600">
      <div className="flex flex-col truncate">
        <span className="font-semibold text-stone-800">Replying to {senderName}</span>
        <span className="truncate max-w-md font-handwriting text-lg">{message.text}</span>
      </div>
      <button
        onClick={onCancel}
        className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
