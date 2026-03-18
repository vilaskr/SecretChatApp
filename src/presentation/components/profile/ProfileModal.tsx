import React, { useState, useRef } from 'react';
import { X, Upload, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../../../application/store/useAuthStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, updateUserProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.photoURL || null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !user) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateUserProfile(displayName, photoFile);
      onClose();
    } catch (error) {
      console.error("Failed to update profile", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border border-stone-200 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h3 className="text-2xl font-serif font-semibold text-stone-900 mb-6">Edit Profile</h3>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex flex-col items-center">
            <div 
              className="w-24 h-24 rounded-full bg-stone-100 border-2 border-stone-200 overflow-hidden flex items-center justify-center relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon className="w-10 h-10 text-stone-400" />
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="w-6 h-6 text-white" />
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*"
            />
            <p className="text-xs text-stone-500 mt-2 font-medium uppercase tracking-wider">Change Picture</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Display Name</label>
            <Input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="border-stone-200 focus:border-stone-400 focus:ring-stone-400"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="ghost" type="button" onClick={onClose} className="text-stone-600 hover:bg-stone-100">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-stone-800 hover:bg-stone-900 text-white min-w-[100px]">
              {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
