'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Hash, AlertCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';

export default function JoinPage() {
  const router = useRouter();
  const { sessionToken, clearSession } = useStudentStore();
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingReconnect, setIsCheckingReconnect] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      if (sessionToken) {
        try {
          const result = await api.join.reconnect(sessionToken);
          // Redirect based on status
          if (result.redirectTo) {
            router.push(result.redirectTo);
            return;
          }
        } catch {
          // Token invalid, clear it
          clearSession();
        }
      }
      setIsCheckingReconnect(false);
    };

    checkExistingSession();
  }, [sessionToken, router, clearSession]);

  // Handle code input with auto-uppercase and limit to 6 characters
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    setAccessCode(value);
    setError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate 6-character code
    if (accessCode.length !== 6) {
      setError('6자리 코드를 입력해주세요');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Verify session exists
      await api.join.lookup(accessCode);
      router.push(`/join/${accessCode}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('세션을 찾을 수 없습니다');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingReconnect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">세션 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            과제 검증 참여
          </h1>
          <p className="text-slate-600">
            교수님이 제공한 6자리 코드를 입력하세요
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Access Code Input */}
            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium text-slate-700 mb-2">
                접근 코드
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Hash className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={handleCodeChange}
                  placeholder="ABC123"
                  className="block w-full pl-12 pr-4 py-4 text-2xl font-mono tracking-widest text-center border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <p className="mt-2 text-sm text-slate-500 text-center">
                {accessCode.length}/6 자리
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={accessCode.length !== 6 || isLoading}
              className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  확인 중...
                </>
              ) : (
                <>
                  참여하기
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Teacher Link */}
          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <Link
              href="/teacher/login"
              className="text-sm text-slate-600 hover:text-blue-600 transition-colors"
            >
              교수자이신가요? 로그인하기
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          QR 코드를 스캔하셨다면 자동으로 코드가 입력됩니다
        </p>
      </div>
    </div>
  );
}
