import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../application/store/useAuthStore';
import { localDb } from '../../infrastructure/db/localDatabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { collection, query, where, onSnapshot, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../infrastructure/firebase/firebaseConfig';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { MessageSquare, Plus, Search, User, LogOut, Link as LinkIcon } from 'lucide-react';
import { generateRoomKey, encryptRoomKey, importPublicKey } from '../../infrastructure/crypto/encryptionService';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ProfileModal } from '../components/profile/ProfileModal';
import ChatRoom from './ChatRoom';

export default function Dashboard() {
  const { user, privateKey, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { roomId } = useParams<{ roomId: string }>();
  
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomMembers, setNewRoomMembers] = useState('');
  const [createError, setCreateError] = useState('');
  
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [usersPresence, setUsersPresence] = useState<Record<string, any>>({});

  const rooms = useLiveQuery(() => localDb.rooms.toArray(), []);

  // Fetch presence for direct chat members
  useEffect(() => {
    if (!rooms || !user) return;
    
    const directChatMemberIds = new Set<string>();
    rooms.forEach(room => {
      if (room.isDirect) {
        const otherMember = room.members.find(m => m !== user.uid);
        if (otherMember) directChatMemberIds.add(otherMember);
      }
    });

    if (directChatMemberIds.size === 0) return;

    const unsubscribes = Array.from(directChatMemberIds).map(uid => {
      return onSnapshot(doc(db, 'users', uid), (docSnap) => {
        if (docSnap.exists()) {
          setUsersPresence(prev => ({ ...prev, [uid]: docSnap.data() }));
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [rooms, user?.uid]);

  useEffect(() => {
    if (roomId) {
      setIsCreatingRoom(false);
      setIsJoiningRoom(false);
    }
  }, [roomId]);

  useEffect(() => {
    const joinId = searchParams.get('join');
    if (joinId) {
      setJoinRoomId(joinId);
      setIsJoiningRoom(true);
      setIsCreatingRoom(false);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user || !privateKey) return;

    const q = query(collection(db, 'rooms'), where('members', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const roomData = change.doc.data();
          const roomId = change.doc.id;
          
          const localRoom = await localDb.rooms.get(roomId);
          if (!localRoom || !localRoom.roomKey) {
            const keyDoc = await getDoc(doc(db, `rooms/${roomId}/keys/${user.uid}`));
            if (keyDoc.exists()) {
              const { encryptedKey, iv, encryptorId, encryptorPublicKey: storedEncryptorPubKey } = keyDoc.data();
              const encryptorUid = encryptorId || roomData.creatorId;
              
              let encryptorPublicKeyJwk = storedEncryptorPubKey;
              if (!encryptorPublicKeyJwk) {
                const encryptorDoc = await getDoc(doc(db, 'users', encryptorUid));
                if (encryptorDoc.exists()) {
                  encryptorPublicKeyJwk = encryptorDoc.data().publicKey;
                }
              }
              
              if (encryptorPublicKeyJwk) {
                const encryptorPublicKey = await importPublicKey(encryptorPublicKeyJwk);
                
                const { deriveAESKey, decryptRoomKey } = await import('../../infrastructure/crypto/encryptionService');
                const sharedKey = await deriveAESKey(privateKey, encryptorPublicKey);
                
                try {
                  const roomKey = await decryptRoomKey(encryptedKey, iv, sharedKey);
                  
                  await localDb.rooms.put({
                    id: roomId,
                    name: roomData.name,
                    creatorId: roomData.creatorId,
                    isDirect: roomData.isDirect,
                    members: roomData.members,
                    roomKey: roomKey
                  });
                } catch (e) {
                  console.error("Failed to decrypt room key", e);
                }
              }
            }
          } else {
            // Update local room if members or name changed
            await localDb.rooms.update(roomId, {
              name: roomData.name,
              members: roomData.members
            });
          }
        } else if (change.type === 'removed') {
          await localDb.rooms.delete(change.doc.id);
          await localDb.messages.where('roomId').equals(change.doc.id).delete();
        }
      }
    }, (error) => {
      console.error("Rooms sync error:", error);
    });

    return () => unsubscribe();
  }, [user, privateKey]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !privateKey) return;
    setCreateError('');

    try {
      const emails = newRoomMembers.split(',').map(e => e.trim()).filter(e => e);
      const memberUids = [user.uid];
      const memberPublicKeys: Record<string, CryptoKey> = {};

      for (const email of emails) {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const memberDoc = snap.docs[0];
          memberUids.push(memberDoc.id);
          memberPublicKeys[memberDoc.id] = await importPublicKey(memberDoc.data().publicKey);
        }
      }

      const roomKey = await generateRoomKey();
      const roomId = crypto.randomUUID();

      await setDoc(doc(db, 'rooms', roomId), {
        name: newRoomName || 'New Chat',
        creatorId: user.uid,
        isDirect: memberUids.length === 2,
        members: memberUids
      });

      const { deriveAESKey } = await import('../../infrastructure/crypto/encryptionService');
      
      const myDoc = await getDoc(doc(db, 'users', user.uid));
      if (!myDoc.exists() || !myDoc.data().publicKey) {
        throw new Error("Your user profile is incomplete. Please reload the page to initialize your encryption keys.");
      }
      
      const myPublicKeyJwk = myDoc.data()!.publicKey;
      const myPublicKey = await importPublicKey(myPublicKeyJwk);
      const mySharedKey = await deriveAESKey(privateKey, myPublicKey);
      const myEncrypted = await encryptRoomKey(roomKey, mySharedKey);
      await setDoc(doc(db, `rooms/${roomId}/keys/${user.uid}`), { ...myEncrypted, encryptorId: user.uid, encryptorPublicKey: myPublicKeyJwk });

      for (const uid of memberUids) {
        if (uid === user.uid) continue;
        const sharedKey = await deriveAESKey(privateKey, memberPublicKeys[uid]);
        const encrypted = await encryptRoomKey(roomKey, sharedKey);
        await setDoc(doc(db, `rooms/${roomId}/keys/${uid}`), { ...encrypted, encryptorId: user.uid, encryptorPublicKey: myPublicKeyJwk });
      }

      await localDb.rooms.put({
        id: roomId,
        name: newRoomName || 'New Chat',
        creatorId: user.uid,
        isDirect: memberUids.length === 2,
        members: memberUids,
        roomKey: roomKey
      });

      setIsCreatingRoom(false);
      setNewRoomName('');
      setNewRoomMembers('');
      navigate(`/room/${roomId}`);
    } catch (error: any) {
      console.error("Failed to create room", error);
      setCreateError(error.message || "Failed to create room. Please try again.");
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinRoomId.trim()) return;
    setJoinMessage('Sending join request...');

    try {
      const myDoc = await getDoc(doc(db, 'users', user.uid));
      if (!myDoc.exists()) throw new Error("User profile not found");

      await setDoc(doc(db, `rooms/${joinRoomId.trim()}/joinRequests/${user.uid}`), {
        publicKey: myDoc.data()!.publicKey,
        email: user.email || '',
        username: user.displayName || user.email || 'Anonymous'
      });
      
      setJoinMessage('Join request sent! Waiting for a member to approve.');
      setTimeout(() => {
        setIsJoiningRoom(false);
        setJoinRoomId('');
        setJoinMessage('');
      }, 3000);
    } catch (error: any) {
      console.error("Failed to send join request", error);
      setJoinMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div className="flex h-screen bg-[#f7f7f5] font-sans overflow-hidden">
      <div className={`w-full md:w-80 border-r border-stone-200 bg-[#f7f7f5] flex-col shrink-0 ${roomId || isCreatingRoom || isJoiningRoom ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-stone-200 flex justify-between items-center">
          <h1 className="text-2xl font-serif font-semibold text-stone-800 tracking-wide">Chats</h1>
        </div>
        
        <div className="p-4">
          <Input 
            type="text" 
            placeholder="Search chats..." 
            icon={<Search className="w-4 h-4 text-stone-400" />}
            className="bg-white border-stone-200 focus:border-stone-400 focus:ring-stone-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {rooms?.map(room => {
            const otherMemberId = room.isDirect ? room.members.find(m => m !== user?.uid) : null;
            const presence = otherMemberId ? usersPresence[otherMemberId] : null;
            const statusColor = presence?.status === 'online' ? 'bg-emerald-500' : presence?.status === 'away' ? 'bg-amber-500' : 'bg-stone-400';

            return (
              <Link 
                key={room.id} 
                to={`/room/${room.id}`}
                className={`flex items-center px-6 py-4 hover:bg-stone-100 cursor-pointer border-b border-stone-100 transition-colors ${roomId === room.id ? 'bg-stone-100' : ''}`}
              >
                <div className="relative w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center mr-4 shrink-0">
                  {room.isDirect ? <User className="w-5 h-5 text-stone-600" /> : <MessageSquare className="w-5 h-5 text-stone-600" />}
                  {room.isDirect && presence && (
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#f7f7f5] ${statusColor}`}></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-serif font-semibold text-stone-900 truncate">{room.name}</h3>
                  <p className="text-xs text-stone-500 truncate font-medium tracking-wide uppercase mt-0.5">Encrypted</p>
                </div>
              </Link>
            );
          })}
          {rooms?.length === 0 && (
            <div className="p-8 text-center text-stone-500 text-sm font-serif italic">
              No chats yet. Create one or join via link.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-stone-200 bg-white flex space-x-3">
          <Button 
            onClick={() => { navigate('/'); setIsJoiningRoom(true); setIsCreatingRoom(false); }} 
            className="flex-1 bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 shadow-sm"
          >
            <LinkIcon className="w-4 h-4 mr-2" /> Join
          </Button>
          <Button 
            onClick={() => { navigate('/'); setIsCreatingRoom(true); setIsJoiningRoom(false); }} 
            className="flex-1 bg-stone-800 text-white hover:bg-stone-900 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> New
          </Button>
        </div>
        <div 
          className="p-4 border-t border-stone-200 flex items-center justify-between bg-stone-50 cursor-pointer hover:bg-stone-100 transition-colors"
          onClick={() => setIsProfileOpen(true)}
        >
          <div className="flex items-center flex-1 min-w-0 mr-2">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full mr-3 shrink-0 object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 bg-stone-800 rounded-full flex items-center justify-center text-white font-serif font-semibold text-sm mr-3 shrink-0">
                {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="text-sm font-medium text-stone-700 truncate flex-1 min-w-0">
              {user?.displayName || user?.email}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); logout(); }} className="text-stone-500 hover:bg-stone-200 shrink-0" title="Logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className={`flex-1 flex-col bg-[#f7f7f5] min-w-0 ${roomId || isCreatingRoom || isJoiningRoom ? 'flex' : 'hidden md:flex'}`}>
        {isCreatingRoom ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 w-full max-w-md">
              <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-stone-800 mb-6">New Chat</h2>
              <form onSubmit={handleCreateRoom} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Chat Name</label>
                  <Input 
                    type="text" 
                    required
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    placeholder="e.g. Project Alpha"
                    className="border-stone-200 focus:border-stone-400 focus:ring-stone-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Invite Members (Emails)</label>
                  <Input 
                    type="text" 
                    required
                    value={newRoomMembers}
                    onChange={e => setNewRoomMembers(e.target.value)}
                    placeholder="alice@example.com, bob@example.com"
                    className="border-stone-200 focus:border-stone-400 focus:ring-stone-400"
                  />
                </div>
                {createError && (
                  <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg font-medium border border-red-100">
                    {createError}
                  </div>
                )}
                <div className="flex justify-between space-x-3 pt-6">
                  <Button variant="ghost" type="button" onClick={() => setIsCreatingRoom(false)} className="flex-1 text-stone-600 hover:bg-stone-100 border border-stone-200">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-stone-800 hover:bg-stone-900 text-white">
                    Create Secure Chat
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : isJoiningRoom ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-stone-200 w-full max-w-md">
              <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-stone-800 mb-6">Join Chat</h2>
              <form onSubmit={handleJoinRoom} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Room ID</label>
                  <Input 
                    type="text" 
                    required
                    value={joinRoomId}
                    onChange={e => setJoinRoomId(e.target.value)}
                    placeholder="Paste Room ID here"
                    className="border-stone-200 focus:border-stone-400 focus:ring-stone-400"
                  />
                </div>
                {joinMessage && (
                  <div className="text-sm text-stone-600 bg-stone-100 p-4 rounded-lg font-medium border border-stone-200">
                    {joinMessage}
                  </div>
                )}
                <div className="flex justify-between space-x-3 pt-6">
                  <Button variant="ghost" type="button" onClick={() => setIsJoiningRoom(false)} className="flex-1 text-stone-600 hover:bg-stone-100 border border-stone-200">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-stone-800 hover:bg-stone-900 text-white">
                    Request to Join
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : roomId ? (
          <ChatRoom />
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-400 flex-col notebook-paper relative">
            <div className="absolute inset-y-0 left-8 notebook-line"></div>
            <div className="z-10 flex flex-col items-center bg-[#f7f7f5]/80 p-6 sm:p-8 rounded-2xl backdrop-blur-sm text-center mx-4">
              <MessageSquare className="w-12 h-12 sm:w-16 sm:h-16 mb-4 sm:mb-6 opacity-20 text-stone-800" />
              <p className="font-serif text-lg sm:text-xl text-stone-600">Select a chat or create a new one</p>
              <p className="text-xs mt-3 opacity-60 font-medium tracking-widest uppercase">End-to-end encrypted</p>
            </div>
          </div>
        )}
      </div>
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </div>
  );
}
