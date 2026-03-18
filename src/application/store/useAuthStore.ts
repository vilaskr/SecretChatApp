import { create } from 'zustand';
import { User as FirebaseUser, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth, db, storage } from '../../infrastructure/firebase/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateKeyPair, exportPublicKey } from '../../infrastructure/crypto/encryptionService';
import { localDb } from '../../infrastructure/db/localDatabase';

interface AuthState {
  user: FirebaseUser | null;
  privateKey: CryptoKey | null;
  loading: boolean;
  isInitialized: boolean;
  initAuth: () => void;
  logout: () => Promise<void>;
  updateUserProfile: (displayName: string, photoFile?: File | null) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  privateKey: null,
  loading: true,
  isInitialized: false,

  initAuth: () => {
    if (get().isInitialized) return;
    set({ isInitialized: true });
    
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // 1. Check if we have a private key locally
          const dbName = `privacy_chat_keys_${firebaseUser.uid}`;
          const request = indexedDB.open(dbName, 1);
          
          request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('keys')) {
              db.createObjectStore('keys');
            }
          };

          request.onerror = (event: any) => {
            console.error("IndexedDB error:", event.target.error);
            set({ user: firebaseUser, privateKey: null, loading: false });
          };

          request.onsuccess = async (event: any) => {
            const idb = event.target.result;
            const transaction = idb.transaction(['keys'], 'readwrite');
            const store = transaction.objectStore('keys');
            
            const getRequest = store.get('privateKey');
            
            getRequest.onerror = (event: any) => {
              console.error("IndexedDB get error:", event.target.error);
              set({ user: firebaseUser, privateKey: null, loading: false });
            };

            getRequest.onsuccess = async () => {
              let privKey = getRequest.result;
              
              try {
                const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                
                if (!privKey || !userDoc.exists() || !userDoc.data()?.publicKey) {
                  // Generate new key pair
                  const keyPair = await generateKeyPair();
                  privKey = keyPair.privateKey;
                  
                  // Save private key locally
                  store.put(privKey, 'privateKey');
                  
                  // Save public key to Firestore
                  const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
                  await setDoc(doc(db, 'users', firebaseUser.uid), {
                    email: firebaseUser.email || '',
                    displayName: firebaseUser.displayName || firebaseUser.email || 'Anonymous',
                    photoURL: firebaseUser.photoURL || null,
                    publicKey: publicKeyJwk,
                    status: 'online',
                    lastSeen: Date.now()
                  }, { merge: true });
                } else {
                  // Update presence
                  await setDoc(doc(db, 'users', firebaseUser.uid), {
                    status: 'online',
                    lastSeen: Date.now()
                  }, { merge: true });
                }

                // Setup presence listeners
                const handleVisibilityChange = () => {
                  if (document.visibilityState === 'visible') {
                    setDoc(doc(db, 'users', firebaseUser.uid), { status: 'online', lastSeen: Date.now() }, { merge: true });
                  } else {
                    setDoc(doc(db, 'users', firebaseUser.uid), { status: 'away', lastSeen: Date.now() }, { merge: true });
                  }
                };
                
                const handleBeforeUnload = () => {
                  setDoc(doc(db, 'users', firebaseUser.uid), { status: 'offline', lastSeen: Date.now() }, { merge: true });
                };

                document.addEventListener('visibilitychange', handleVisibilityChange);
                window.addEventListener('beforeunload', handleBeforeUnload);
                
                set({ user: firebaseUser, privateKey: privKey, loading: false });
              } catch (e) {
                console.error("Key generation/storage error:", e);
                set({ user: firebaseUser, privateKey: null, loading: false });
              }
            };
          };
        } catch (error) {
          console.error("Auth init error:", error);
          set({ user: firebaseUser, privateKey: null, loading: false });
        }
      } else {
        set({ user: null, privateKey: null, loading: false });
      }
    });
  },

  updateUserProfile: async (displayName: string, photoFile?: File | null) => {
    const currentUser = get().user;
    if (!currentUser) return;

    let photoURL = currentUser.photoURL;

    if (photoFile) {
      const storageRef = ref(storage, `profiles/${currentUser.uid}/${Date.now()}_${photoFile.name}`);
      await uploadBytes(storageRef, photoFile);
      photoURL = await getDownloadURL(storageRef);
    }

    await updateProfile(currentUser, {
      displayName: displayName || currentUser.displayName,
      photoURL: photoURL
    });

    // Update in Firestore
    await setDoc(doc(db, 'users', currentUser.uid), {
      displayName: displayName || currentUser.displayName,
      photoURL: photoURL
    }, { merge: true });

    // Force a re-render by updating the user object in state
    // Create a new object to ensure React detects the change
    set({ user: { ...auth.currentUser } as FirebaseUser });
  },

  logout: async () => {
    await auth.signOut();
    set({ user: null, privateKey: null });
  }
}));
