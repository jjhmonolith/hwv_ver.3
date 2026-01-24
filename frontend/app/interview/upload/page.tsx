'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStudentStore, Topic } from '@/lib/store';

export default function UploadPage() {
  const router = useRouter();
  const { sessionToken, participant, sessionInfo, setParticipant } = useStudentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzedTopics, setAnalyzedTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Track hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Redirect if not authenticated (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    if (!sessionToken || !participant) {
      router.push('/join');
    }
  }, [isHydrated, sessionToken, participant, router]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  // Validate and set file
  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    setAnalyzedTopics(null);

    // Check file type
    if (selectedFile.type !== 'application/pdf') {
      setError('PDF 파일만 업로드할 수 있습니다');
      return;
    }

    // Check file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('파일 크기는 10MB 이하여야 합니다');
      return;
    }

    setFile(selectedFile);
  };

  // Handle upload
  const handleUpload = async () => {
    if (!file || !sessionToken) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 500);

    try {
      const result = await api.interview.upload(sessionToken, file);
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Store analyzed topics
      const topics = (result.analyzedTopics as Topic[]).map((t, idx) => ({
        ...t,
        index: idx,
      }));
      setAnalyzedTopics(topics);

      // Update participant status
      setParticipant({
        ...participant!,
        status: 'file_submitted',
        analyzedTopics: topics,
      });
    } catch (err) {
      clearInterval(progressInterval);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('파일 업로드에 실패했습니다');
      }
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle continue to next step
  const handleContinue = () => {
    router.push('/interview/start');
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setFile(null);
    setAnalyzedTopics(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!sessionToken || !participant) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            과제 파일 업로드
          </h1>
          <p className="text-slate-600">
            {sessionInfo?.title || '과제'} 검증을 위해 PDF 파일을 업로드해주세요
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
              1
            </div>
            <span className="text-sm text-slate-600">파일 업로드</span>
          </div>
          <div className="w-12 h-0.5 bg-slate-200 mx-2" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center text-sm font-bold">
              2
            </div>
            <span className="text-sm text-slate-400">인터뷰 시작</span>
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          {!file ? (
            // Drop Zone
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload
                className={`h-12 w-12 mx-auto mb-4 ${
                  isDragging ? 'text-blue-500' : 'text-slate-400'
                }`}
              />
              <p className="text-lg font-medium text-slate-700 mb-2">
                {isDragging ? '여기에 놓으세요' : 'PDF 파일을 드래그하거나 클릭하세요'}
              </p>
              <p className="text-sm text-slate-500">
                최대 10MB까지 업로드 가능
              </p>
            </div>
          ) : (
            // File Preview
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <FileText className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 truncate max-w-xs">
                      {file.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                {!analyzedTopics && !isUploading && (
                  <button
                    onClick={handleRemoveFile}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {uploadProgress < 50
                        ? '파일 업로드 중...'
                        : uploadProgress < 90
                        ? 'AI가 분석 중...'
                        : '분석 완료!'}
                    </span>
                    <span className="text-blue-600 font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Button */}
              {!analyzedTopics && !isUploading && (
                <button
                  onClick={handleUpload}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all"
                >
                  <Sparkles className="h-5 w-5" />
                  AI 분석 시작
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Analyzed Topics */}
        {analyzedTopics && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-bold text-slate-900">분석 완료!</h2>
            </div>
            <p className="text-slate-600 mb-4">
              AI가 과제에서 다음 {analyzedTopics.length}개의 주제를 추출했습니다:
            </p>
            <ul className="space-y-3">
              {analyzedTopics.map((topic, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{topic.title}</p>
                    <p className="text-sm text-slate-500">{topic.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 mt-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all"
            >
              다음 단계로
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Info Note */}
        <p className="text-center text-sm text-slate-500">
          업로드된 파일은 인터뷰 질문 생성에만 사용됩니다
        </p>
      </div>
    </div>
  );
}
