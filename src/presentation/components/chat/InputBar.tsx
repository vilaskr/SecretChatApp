import React, { useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { ReplyPreview } from './ReplyPreview';
import { Message } from '../../../domain/models';

interface InputBarProps {
  text: string;
  setText: (text: string) => void;
  onSend: (e: React.FormEvent) => void;
  onFilesSelect: (files: FileList) => void;
  replyingTo?: Message | null;
  replyingToName?: string;
  onCancelReply: () => void;
  selectedFiles?: File[];
  onRemoveFile?: (index: number) => void;
  isUploading?: boolean;
  uploadProgress?: Record<string, number>;
}

export function InputBar({
  text,
  setText,
  onSend,
  onFilesSelect,
  replyingTo,
  replyingToName,
  onCancelReply,
  selectedFiles = [],
  onRemoveFile,
  isUploading,
  uploadProgress = {}
}: InputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(e as any);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelect(e.target.files);
      // Clear the value so the same file can be selected again
      e.target.value = '';
    }
  };

  return (
    <div className="bg-[#f7f7f5] border-t border-stone-200">
      {replyingTo && (
        <ReplyPreview
          message={replyingTo}
          senderName={replyingToName || 'Unknown'}
          onCancel={onCancelReply}
        />
      )}
      {selectedFiles.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex flex-col bg-stone-200 px-3 py-1.5 rounded-lg text-sm text-stone-700 min-w-[120px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate mr-2">
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-[150px]">{file.name}</span>
                </div>
                {!isUploading && (
                  <button type="button" onClick={() => onRemoveFile?.(index)} className="text-stone-500 hover:text-stone-800">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {uploadProgress[file.name] !== undefined && (
                <div className="mt-1.5 w-full bg-stone-300 rounded-full h-1 overflow-hidden">
                  <div 
                    className="bg-stone-800 h-full transition-all duration-300" 
                    style={{ width: `${uploadProgress[file.name]}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={onSend} className="flex items-center p-2 sm:p-4 space-x-2 sm:space-x-3 pt-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 sm:p-3 text-stone-500 hover:text-stone-800 rounded-full hover:bg-stone-200 transition-colors shrink-0"
          disabled={isUploading}
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="image/*,application/pdf,video/*,audio/*,text/*"
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isUploading ? "Uploading..." : "Write a message..."}
          disabled={isUploading}
          className="flex-1 max-h-32 min-h-[44px] sm:min-h-[48px] bg-white border border-stone-300 rounded-2xl px-4 sm:px-5 py-2 sm:py-2.5 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none leading-relaxed font-sans text-sm sm:text-base shadow-inner disabled:opacity-50"
          rows={1}
        />
        <button
          type="submit"
          disabled={(!text.trim() && selectedFiles.length === 0) || isUploading}
          className="p-2 sm:p-3 bg-stone-800 text-white rounded-full hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shrink-0"
        >
          {isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}
