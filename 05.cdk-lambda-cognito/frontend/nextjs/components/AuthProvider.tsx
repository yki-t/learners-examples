'use client';

import { Amplify } from 'aws-amplify';
import { amplifyConfig } from '@/lib/amplify-config';
import { useEffect } from 'react';

Amplify.configure(amplifyConfig, { ssr: false });

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // クライアントサイドでのみAmplifyを初期化
    Amplify.configure(amplifyConfig, { ssr: false });
  }, []);

  return <>{children}</>;
}
