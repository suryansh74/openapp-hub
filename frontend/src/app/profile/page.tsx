'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function ProfilePage() {
  const { data: session } = useSession();
  useEffect(() => {
    document.title = "Profile · OpenApp Hub";
    return () => { document.title = "OpenApp Hub"; };
  }, []);

  const router = useRouter();
  const [avatar, setAvatar] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch current user data (including avatar)
  useEffect(() => {
    if (!session?.user?.email) {
      router.push('/');
      return;
    }
    fetchUserData();
  }, [session]);

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/user', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setName(data.user.name || data.user.email.split('@')[0]);
        setAvatar(data.user.avatar || '/placeholder-avatar.png');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setAvatar(data.url);
        setMessage('Avatar updated successfully!');
        // Refresh profile data
        fetchUserData();
      } else {
        setMessage(data.error || 'Upload failed');
      }
    } catch (err) {
      setMessage('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar }),
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage('Profile updated!');
      } else {
        setMessage(data.error || 'Failed to update');
      }
    } catch (err) {
      setMessage('Something went wrong');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">My Profile</h1>

        <div className="bg-gray-900 rounded-3xl p-8 shadow-xl">
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative w-40 h-40 mb-6">
              <Image
                src={avatar || '/placeholder-avatar.png'}
                alt="Profile Avatar"
                fill
                className="rounded-2xl object-cover ring-4 ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Avatar (PNG, JPG, WEBP)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500"
              />
              {uploading && <p className="text-blue-400 mt-2">Uploading avatar...</p>}
            </div>
          </div>

          {/* Name Section */}
          <div className="mb-8">
            <label className="block text-sm text-gray-400 mb-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSaveProfile}
              className="flex-1 bg-blue-600 hover:bg-blue-700 transition-colors py-4 rounded-2xl font-semibold text-lg"
            >
              Save Profile
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 border border-gray-700 hover:bg-gray-800 transition-colors py-4 rounded-2xl font-semibold text-lg"
            >
              Back to Discover
            </button>
          </div>

          {message && (
            <p className={`mt-6 text-center text-sm ${message.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
        </div>

        {/* Published Apps Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">My Published Apps</h2>
          {/* Here we will add the list of your published apps */}
          <div className="text-gray-400 text-center py-12">
            Published apps list will appear here (coming in next update)
          </div>
        </div>
      </div>
    </div>
  );
}
