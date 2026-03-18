import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './application/store/useAuthStore';
import { useChatStore } from './application/store/useChatStore';
import { localDb } from './infrastructure/db/localDatabase';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './infrastructure/firebase/firebaseConfig';
import Login from './presentation/pages/Login';
import Dashboard from './presentation/pages/Dashboard';
import ChatRoom from './presentation/pages/ChatRoom';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] text-stone-500 font-serif italic text-lg">Loading secure environment...</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  const { initAuth, user } = useAuthStore();
  const { setOnlineStatus } = useChatStore();

  useEffect(() => {
    initAuth();
    
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initAuth, setOnlineStatus]);

  // Background cleanup job (30 days retention)
  useEffect(() => {
    const cleanup = async () => {
      if (!user) return;
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - THIRTY_DAYS_MS;

      try {
        // 1. Clean local DB
        const oldLocalMessages = await localDb.messages.where('timestamp').below(cutoff).toArray();
        if (oldLocalMessages.length > 0) {
          const idsToDelete = oldLocalMessages.map(m => m.id);
          await localDb.messages.bulkDelete(idsToDelete);
        }

        // 2. Clean Firebase (only messages I sent, to avoid permission issues)
        const rooms = await localDb.rooms.toArray();
        for (const room of rooms) {
          const q = query(
            collection(db, `rooms/${room.id}/messages`),
            where('senderId', '==', user.uid),
            where('timestamp', '<', cutoff)
          );
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            await deleteDoc(docSnap.ref);
          }
        }
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };

    const interval = setInterval(cleanup, 60 * 60 * 1000); // Run every hour
    cleanup(); // Run on mount

    return () => clearInterval(interval);
  }, [user]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/room/:roomId" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      </Routes>
    </Router>
  );
}

export default App;
