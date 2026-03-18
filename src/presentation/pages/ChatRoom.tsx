import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../application/store/useAuthStore';
import { useChatStore } from '../../application/store/useChatStore';
import { localDb } from '../../infrastructure/db/localDatabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, storage } from '../../infrastructure/firebase/firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { decryptMessage, encryptRoomKey, importPublicKey, encryptFile } from '../../infrastructure/crypto/encryptionService';
import { exportChatToHTML } from '../../application/services/exportService';
import { ArrowLeft, Download, Send, Link as LinkIcon, Check, X, Trash2, LogOut, Copy } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MessageEntry } from '../components/chat/MessageEntry';
import { InputBar } from '../components/chat/InputBar';
import { Message } from '../../domain/models';

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, privateKey } = useAuthStore();
  const { sendMessage } = useChatStore();
  
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [otherUsersPresence, setOtherUsersPresence] = useState<Record<string, any>>({});

  const room = useLiveQuery(() => roomId ? localDb.rooms.get(roomId) : undefined, [roomId]);
  const messages = useLiveQuery(
    () => roomId ? localDb.messages.where('roomId').equals(roomId).sortBy('timestamp') : [],
    [roomId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!room || !user) return;
    const otherMemberIds = room.members.filter(m => m !== user.uid);
    if (otherMemberIds.length === 0) return;

    const unsubscribes = otherMemberIds.map(uid => {
      return onSnapshot(doc(db, 'users', uid), (docSnap) => {
        if (docSnap.exists()) {
          setOtherUsersPresence(prev => ({ ...prev, [uid]: docSnap.data() }));
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [room?.members, user?.uid]);

  useEffect(() => {
    if (!roomId || !room?.roomKey || !user) return;

    const q = query(collection(db, `rooms/${roomId}/messages`), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const msgData = change.doc.data();
        const msgId = change.doc.id;
        
        if (change.type === 'added') {
          if (msgData.senderId === user.uid) {
            continue;
          }

          const existing = await localDb.messages.get(msgId);
          if (!existing) {
            try {
              const decryptedText = await decryptMessage(msgData.ciphertext, msgData.iv, room.roomKey);
              
              let payload: any = { type: 'text', text: decryptedText };
              try {
                const parsed = JSON.parse(decryptedText);
                if (parsed && typeof parsed === 'object' && parsed.type) {
                  payload = parsed;
                }
              } catch (e) {
                // Not JSON, treat as plain text
              }

              await localDb.messages.put({
                id: msgId,
                roomId,
                senderId: msgData.senderId,
                text: payload.text || '',
                timestamp: msgData.timestamp,
                isSent: true,
                status: 'sent',
                type: payload.type || 'text',
                replyToMessageId: payload.replyToMessageId,
                targetMessageId: payload.targetMessageId,
                reaction: payload.reaction,
                fileUrl: payload.fileUrl,
                fileName: payload.fileName,
                fileType: payload.fileType,
                fileIv: payload.fileIv
              });
            } catch (e) {
              console.error("Failed to decrypt message", e);
            }
          }
        }
      }
    }, (error) => {
      console.error("Messages sync error:", error);
    });

    return () => unsubscribe();
  }, [roomId, room?.roomKey, user]);

  useEffect(() => {
    if (!roomId || !user || !room) return;
    const q = query(collection(db, `rooms/${roomId}/joinRequests`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs: any[] = [];
      snapshot.forEach(doc => {
        reqs.push({ id: doc.id, ...doc.data() });
      });
      setJoinRequests(reqs);
    }, (error) => {
      console.error("Join requests error:", error);
    });
    return () => unsubscribe();
  }, [roomId, user, room]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && selectedFiles.length === 0) || !roomId || !room?.roomKey || !user || isUploading) return;

    const currentText = text;
    const currentFiles = [...selectedFiles];
    const replyId = replyingTo?.id;
    
    setText('');
    setSelectedFiles([]);
    setReplyingTo(null);
    
    if (currentFiles.length > 0) {
      setIsUploading(true);
      try {
        // If there's text, send it first as a separate message if there are multiple files
        // or just include it with the first file.
        // For simplicity, if there's text and files, we'll send the text with the first file.
        
        for (let i = 0; i < currentFiles.length; i++) {
          const file = currentFiles[i];
          const fileData = await file.arrayBuffer();
          const { ciphertext, iv } = await encryptFile(fileData, room.roomKey);
          
          const storageRef = ref(storage, `files/${roomId}/${Date.now()}_${file.name}`);
          const { uploadBytesResumable } = await import('firebase/storage');
          
          const uploadTask = uploadBytesResumable(storageRef, new Uint8Array(ciphertext));
          
          await new Promise<void>((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
              }, 
              (error) => {
                console.error("Upload error:", error);
                reject(error);
              }, 
              () => resolve()
            );
          });

          const fileUrl = await getDownloadURL(storageRef);
          
          await sendMessage(roomId, (i === 0 ? currentText : '') || file.name, user.uid, room.roomKey, {
            type: 'file',
            fileUrl,
            fileName: file.name,
            fileType: file.type,
            fileIv: iv,
            replyToMessageId: i === 0 ? replyId : undefined
          });
          
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to upload file", e);
        setError('Failed to upload file: ' + (e as Error).message);
      } finally {
        setIsUploading(false);
        setUploadProgress({});
      }
    } else {
      try {
        await sendMessage(roomId, currentText, user.uid, room.roomKey, {
          replyToMessageId: replyId,
          type: 'text'
        });
      } catch (e) {
        console.error(e);
        setError('Failed to send message');
      }
    }
  };

  const handleFilesSelect = (files: FileList) => {
    setSelectedFiles(prev => [...prev, ...Array.from(files)]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleReact = async (msgId: string, reaction: string) => {
    if (!roomId || !room?.roomKey || !user) return;
    try {
      await sendMessage(roomId, '', user.uid, room.roomKey, {
        type: 'reaction',
        targetMessageId: msgId,
        reaction
      });
    } catch (e) {
      console.error('Failed to send reaction', e);
    }
  };

  const handleExport = () => {
    if (!room || !messages || !user) return;
    exportChatToHTML(room, messages, user.uid);
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/?join=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleApproveRequest = async (req: any) => {
    if (!room?.roomKey || !privateKey || !roomId) return;
    try {
      const requesterPubKey = await importPublicKey(req.publicKey);
      const { deriveAESKey } = await import('../../infrastructure/crypto/encryptionService');
      const sharedKey = await deriveAESKey(privateKey, requesterPubKey);
      const encrypted = await encryptRoomKey(room.roomKey, sharedKey);
      
      const myDoc = await getDoc(doc(db, 'users', user.uid));
      const myPublicKeyJwk = myDoc.data()!.publicKey;

      await updateDoc(doc(db, 'rooms', roomId), { members: arrayUnion(req.id) });
      await setDoc(doc(db, `rooms/${roomId}/keys/${req.id}`), { ...encrypted, encryptorId: user.uid, encryptorPublicKey: myPublicKeyJwk });
      await deleteDoc(doc(db, `rooms/${roomId}/joinRequests/${req.id}`));
    } catch (e) {
      console.error("Failed to approve request", e);
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    if (!roomId) return;
    try {
      await deleteDoc(doc(db, `rooms/${roomId}/joinRequests/${reqId}`));
    } catch (e) {
      console.error("Failed to reject request", e);
    }
  };

  const handleDeleteOrLeave = async () => {
    if (!room || !user || !roomId) return;
    
    try {
      if (room.creatorId === user.uid) {
        await deleteDoc(doc(db, 'rooms', roomId));
      } else {
        await updateDoc(doc(db, 'rooms', roomId), {
          members: room.members.filter(m => m !== user.uid)
        });
      }
      await localDb.rooms.delete(roomId);
      await localDb.messages.where('roomId').equals(roomId).delete();
      navigate('/');
    } catch (e) {
      console.error("Failed to delete/leave room", e);
      setError("Failed to perform action.");
    }
  };

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f7f7f5]">
        <div className="text-stone-500 font-serif italic">Loading secure room...</div>
      </div>
    );
  }

  const isCreator = room.creatorId === user?.uid;

  const otherMemberId = room.isDirect ? room.members.find(m => m !== user?.uid) : null;
  const otherPresence = otherMemberId ? otherUsersPresence[otherMemberId] : null;
  const statusText = otherPresence?.status === 'online' ? 'Online' : otherPresence?.status === 'away' ? 'Away' : 'Offline';
  const statusColor = otherPresence?.status === 'online' ? 'bg-emerald-500' : otherPresence?.status === 'away' ? 'bg-amber-500' : 'bg-stone-400';

  return (
    <div className="flex-1 flex flex-col bg-[#f7f7f5] min-h-0 font-sans relative">
      <div className="h-16 sm:h-20 border-b border-stone-300 bg-[#f7f7f5] flex items-center justify-between px-3 sm:px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center min-w-0 flex-1 mr-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="mr-1 sm:mr-3 md:hidden text-stone-600 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-serif font-semibold text-stone-900 truncate">{room.name}</h2>
            <p className="text-[10px] sm:text-xs text-stone-500 flex items-center font-medium tracking-wide uppercase mt-0.5 sm:mt-1 truncate">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 mr-1.5 sm:mr-2 shadow-sm shrink-0"></span>
              <span className="truncate">Encrypted</span>
              {room.isDirect && otherPresence && (
                <>
                  <span className="mx-1 sm:mx-2 text-stone-300 shrink-0">•</span>
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusColor} mr-1 sm:mr-1.5 shadow-sm shrink-0`}></span>
                  <span className="truncate">{statusText}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex space-x-1 sm:space-x-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={copyRoomCode} title="Copy Room Code" className="text-stone-600 hover:bg-stone-200 rounded-full h-8 w-8 sm:h-10 sm:w-10">
            {copiedCode ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" /> : <Copy className="w-4 h-4 sm:w-5 sm:h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={copyInviteLink} title="Copy Invite Link" className="text-stone-600 hover:bg-stone-200 rounded-full h-8 w-8 sm:h-10 sm:w-10">
            {copied ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" /> : <LinkIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleExport} title="Export Chat" className="text-stone-600 hover:bg-stone-200 rounded-full h-8 w-8 sm:h-10 sm:w-10">
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowConfirmModal(true)} title={isCreator ? "Delete Room" : "Leave Room"} className="text-red-600 hover:bg-red-50 rounded-full h-8 w-8 sm:h-10 sm:w-10">
            {isCreator ? <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />}
          </Button>
        </div>
      </div>

      {showConfirmModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border border-stone-200">
            <h3 className="text-xl font-serif font-semibold text-stone-900 mb-2">
              {isCreator ? "Delete Chat Room?" : "Leave Chat Room?"}
            </h3>
            <p className="text-sm text-stone-600 mb-6">
              {isCreator 
                ? "This will permanently delete the room and all messages for everyone. This action cannot be undone." 
                : "You will no longer have access to this room's messages. You will need a new invite to rejoin."}
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="ghost" onClick={() => setShowConfirmModal(false)} className="text-stone-600">
                Cancel
              </Button>
              <Button onClick={handleDeleteOrLeave} className="bg-red-600 hover:bg-red-700 text-white border-transparent">
                {isCreator ? "Delete" : "Leave"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {joinRequests.length > 0 && (
        <div className="bg-amber-50/80 border-b border-amber-200 p-4 shrink-0 z-10 backdrop-blur-sm">
          <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3">Pending Join Requests</h4>
          <div className="space-y-2">
            {joinRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-amber-100 shadow-sm">
                <div className="text-sm text-amber-900">
                  <span className="font-semibold">{req.username}</span> ({req.email}) wants to join.
                </div>
                <div className="flex space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => handleRejectRequest(req.id)} className="text-stone-500 hover:text-stone-700">
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => handleApproveRequest(req)} className="bg-amber-600 hover:bg-amber-700 text-white">
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-8 px-6 notebook-paper relative">
        <div className="absolute inset-y-0 left-8 notebook-line hidden sm:block"></div>
        <div className="relative z-10 max-w-4xl mx-auto pl-0 sm:pl-12">
          {messages?.filter(m => m.type !== 'reaction').map((msg, index, arr) => {
            const isGrouped = index > 0 && arr[index - 1].senderId === msg.senderId && (msg.timestamp - arr[index - 1].timestamp < 5 * 60 * 1000);
            
            // Find replied message
            const repliedMessage = msg.replyToMessageId ? arr.find(m => m.id === msg.replyToMessageId) : undefined;
            const repliedMessageSenderName = repliedMessage ? (repliedMessage.senderId === user?.uid ? 'You' : 'Someone') : undefined; // Ideally fetch real name

            // Aggregate reactions from all messages
            const reactionMessages = messages.filter(m => m.type === 'reaction' && m.targetMessageId === msg.id);
            const reactionsMap: Record<string, string[]> = {};
            
            // Sort by timestamp to process chronologically
            reactionMessages.sort((a, b) => a.timestamp - b.timestamp).forEach(r => {
              if (r.reaction && r.senderId) {
                // If we want to allow toggling, we could remove it if it exists, but for simplicity let's just add it
                // Or better, if they send the same reaction again, it toggles it
                if (!reactionsMap[r.reaction]) reactionsMap[r.reaction] = [];
                const userIdx = reactionsMap[r.reaction].indexOf(r.senderId);
                if (userIdx > -1) {
                  reactionsMap[r.reaction].splice(userIdx, 1); // Toggle off
                } else {
                  reactionsMap[r.reaction].push(r.senderId); // Toggle on
                }
              }
            });

            // Clean up empty reactions
            Object.keys(reactionsMap).forEach(key => {
              if (reactionsMap[key].length === 0) delete reactionsMap[key];
            });

            const userReactions: string[] = [];
            for (const [emoji, users] of Object.entries(reactionsMap)) {
              if (users.includes(user?.uid || '')) {
                userReactions.push(emoji);
              }
            }
            
            // Count reactions
            const reactionCounts: Record<string, number> = {};
            for (const [emoji, users] of Object.entries(reactionsMap)) {
              reactionCounts[emoji] = users.length;
            }

            return (
              <MessageEntry 
                key={msg.id} 
                message={msg} 
                senderName={msg.senderId === user?.uid ? 'You' : 'Member'} // Ideally fetch real name
                isSender={msg.senderId === user?.uid}
                isGrouped={isGrouped}
                repliedMessage={repliedMessage}
                repliedMessageSenderName={repliedMessageSenderName}
                reactions={reactionCounts}
                userReactions={userReactions}
                onReply={setReplyingTo}
                onReact={handleReact}
                roomKey={room.roomKey}
              />
            );
          })}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <div className="shrink-0 z-10">
        {error && <div className="text-red-500 text-sm px-4 py-2 font-medium bg-red-50 border-t border-red-100">{error}</div>}
        <InputBar
          text={text}
          setText={setText}
          onSend={handleSend}
          onFilesSelect={handleFilesSelect}
          replyingTo={replyingTo}
          replyingToName={replyingTo ? (replyingTo.senderId === user?.uid ? 'You' : 'Member') : undefined}
          onCancelReply={() => setReplyingTo(null)}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
      </div>
    </div>
  );
}
