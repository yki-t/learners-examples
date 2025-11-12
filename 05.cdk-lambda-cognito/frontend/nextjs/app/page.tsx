'use client';

import { useState, useEffect } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { fetchAuthSession, signOut } from '@aws-amplify/auth';

interface UserProfile {
  userId: string;
  displayName?: string;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function Home() {
  const [userInfo, setUserInfo] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

  // 認証済みユーザー情報を取得
  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No token found');
      }

      const response = await fetch(`${API_ENDPOINT}/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch user info');

      const data = await response.json();
      setUserInfo(data);
      setError('');
    } catch (err) {
      console.error('Error:', err);
      setError('ユーザー情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // プロフィール取得
  const fetchProfile = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No token found');
      }

      const response = await fetch(`${API_ENDPOINT}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch profile');

      const data = await response.json();
      setProfile(data);
      if (data.displayName) setDisplayName(data.displayName);
      if (data.bio) setBio(data.bio);
      setError('');
    } catch (err) {
      console.error('Error:', err);
      setError('プロフィールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // プロフィール保存
  const saveProfile = async () => {
    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No token found');
      }

      const response = await fetch(`${API_ENDPOINT}/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ displayName, bio })
      });

      if (!response.ok) throw new Error('Failed to save profile');

      const data = await response.json();
      setProfile(data);
      setError('');
      alert('プロフィールを保存しました');
    } catch (err) {
      console.error('Error:', err);
      setError('プロフィールの保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Authenticator>
      {({ user }) => (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">
                  Cognito Auth Demo
                </h1>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  ログアウト
                </button>
              </div>

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              <div className="mb-6 p-4 bg-green-50 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">ようこそ！</h2>
                <p className="text-gray-700">
                  メールアドレス: <span className="font-mono">{user?.signInDetails?.loginId}</span>
                </p>
                <p className="text-gray-700">
                  ユーザーID: <span className="font-mono text-sm">{user?.userId}</span>
                </p>
              </div>

              <div className="mb-4">
                <button
                  onClick={fetchUserInfo}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
                >
                  {loading ? '読み込み中...' : 'ユーザー情報を取得（API呼び出し）'}
                </button>
              </div>

              {userInfo && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">API レスポンス</h3>
                  <pre className="text-sm overflow-auto">
                    {JSON.stringify(userInfo, null, 2)}
                  </pre>
                </div>
              )}

              <hr className="my-6" />

              <h2 className="text-2xl font-bold mb-4">プロフィール</h2>

              <div className="mb-4">
                <button
                  onClick={fetchProfile}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400"
                >
                  {loading ? '読み込み中...' : 'プロフィールを取得'}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    表示名
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="山田太郎"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    自己紹介
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="簡単な自己紹介を入力してください"
                  />
                </div>

                <button
                  onClick={saveProfile}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:bg-gray-400"
                >
                  {loading ? '保存中...' : 'プロフィールを保存'}
                </button>
              </div>

              {profile && (
                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">保存されたプロフィール</h3>
                  <pre className="text-sm overflow-auto">
                    {JSON.stringify(profile, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Authenticator>
  );
}
