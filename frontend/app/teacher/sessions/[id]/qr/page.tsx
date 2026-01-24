'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useTeacherStore } from '@/lib/store';
import { api, ApiError } from '@/lib/api';
import { ArrowLeft, Copy, Printer, ExternalLink } from 'lucide-react';

interface QRData {
  qrCodeUrl: string;
  accessUrl: string;
  accessCode: string;
}

export default function SessionQRPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const { token } = useTeacherStore();

  const [qrData, setQrData] = useState<QRData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<'code' | 'url' | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!token) {
      router.replace('/teacher/login');
    }
  }, [token, router]);

  // Fetch QR code data
  const fetchQR = useCallback(async () => {
    if (!token || !sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.sessions.get(token, sessionId);
      const session = result as unknown as { accessCode?: string; status: string };

      if (session.status !== 'active' || !session.accessCode) {
        setError('Session must be active to show QR code');
        return;
      }

      // Generate QR code URL
      const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
      const accessUrl = `${frontendUrl}/join/${session.accessCode}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(accessUrl)}`;

      setQrData({
        qrCodeUrl,
        accessUrl,
        accessCode: session.accessCode,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load QR code');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    fetchQR();
  }, [fetchQR]);

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'code' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(null), 2000);
    }
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header - Hidden on print */}
      <header className="print:hidden bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => router.push(`/teacher/sessions/${sessionId}`)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Back to Session
            </Button>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
              className="bg-gray-700 text-white hover:bg-gray-600 border-gray-600"
            >
              Print
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {isLoading ? (
          <div className="text-center py-20">
            <p className="text-gray-400">Loading QR code...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <Button
              variant="secondary"
              onClick={() => router.push(`/teacher/sessions/${sessionId}`)}
              className="bg-gray-700 text-white hover:bg-gray-600"
            >
              Back to Session
            </Button>
          </div>
        ) : qrData ? (
          <div className="flex flex-col items-center">
            {/* Title */}
            <h1 className="text-2xl font-bold text-center mb-2">Scan to Join Session</h1>
            <p className="text-gray-400 text-center mb-8">
              Students can scan this QR code to join the session
            </p>

            {/* QR Code */}
            <div className="bg-white p-6 rounded-2xl shadow-2xl mb-8">
              <img
                src={qrData.qrCodeUrl}
                alt="QR Code"
                className="w-64 h-64 sm:w-80 sm:h-80"
              />
            </div>

            {/* Access Code */}
            <div className="text-center mb-8">
              <p className="text-gray-400 mb-2">Or enter this code manually:</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl sm:text-6xl font-mono font-bold tracking-widest">
                  {qrData.accessCode}
                </span>
                <button
                  onClick={() => copyToClipboard(qrData.accessCode, 'code')}
                  className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors print:hidden"
                  title="Copy code"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
              {copySuccess === 'code' && (
                <p className="text-green-400 text-sm mt-2 print:hidden">Copied!</p>
              )}
            </div>

            {/* Access URL */}
            <div className="print:hidden w-full max-w-md">
              <p className="text-gray-400 text-center mb-2">Direct link:</p>
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
                <input
                  type="text"
                  value={qrData.accessUrl}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-gray-300 outline-none"
                />
                <button
                  onClick={() => copyToClipboard(qrData.accessUrl, 'url')}
                  className="p-1.5 rounded hover:bg-gray-700 transition-colors"
                  title="Copy URL"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={qrData.accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-gray-700 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              {copySuccess === 'url' && (
                <p className="text-green-400 text-sm text-center mt-2">URL copied!</p>
              )}
            </div>

            {/* Print Footer */}
            <div className="hidden print:block mt-8 text-center">
              <p className="text-gray-600">HW Validator - Homework Verification System</p>
            </div>
          </div>
        ) : null}
      </main>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .min-h-screen {
            min-height: auto !important;
            background: white !important;
          }
          .text-white {
            color: black !important;
          }
          .text-gray-400 {
            color: #666 !important;
          }
          .bg-gray-900 {
            background: white !important;
          }
          .bg-white {
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
