'use client';

import React, { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTeacherStore, Session } from '@/lib/store';
import { api, ApiError } from '@/lib/api';

export interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (session: Session) => void;
}

type InterviewMode = 'voice' | 'chat' | 'student_choice';

interface FormData {
  title: string;
  description: string;
  topicCount: number;
  topicDuration: number;
  interviewMode: InterviewMode;
  assignmentInfo: string;
}

const initialFormData: FormData = {
  title: '',
  description: '',
  topicCount: 3,
  topicDuration: 180,
  interviewMode: 'student_choice',
  assignmentInfo: '',
};

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { token, addSession } = useTeacherStore();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length > 200) {
      newErrors.title = 'Title must be 200 characters or less';
    }

    if (formData.topicCount < 1 || formData.topicCount > 5) {
      newErrors.topicCount = 'Topic count must be between 1 and 5';
    }

    if (formData.topicDuration < 60 || formData.topicDuration > 600) {
      newErrors.topicDuration = 'Duration must be between 60 and 600 seconds';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;
    if (!token) {
      setApiError('Not authenticated');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await api.sessions.create(token, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        topicCount: formData.topicCount,
        topicDuration: formData.topicDuration,
        interviewMode: formData.interviewMode,
        assignmentInfo: formData.assignmentInfo.trim() || undefined,
      });

      const newSession: Session = {
        id: (result as { session: { id: string } }).session.id,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        status: 'draft',
        topicCount: formData.topicCount,
        topicDuration: formData.topicDuration,
        interviewMode: formData.interviewMode,
        createdAt: new Date().toISOString(),
      };

      addSession(newSession);
      onSuccess?.(newSession);
      handleClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('Failed to create session');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setApiError(null);
    onClose();
  };

  const handleInputChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value =
      field === 'topicCount' || field === 'topicDuration'
        ? parseInt(e.target.value, 10) || 0
        : e.target.value;

    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Session"
      description="Set up a new homework verification session"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        {apiError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {apiError}
          </div>
        )}

        <div className="space-y-4">
          {/* Title */}
          <Input
            label="Session Title"
            placeholder="e.g., Final Project Verification"
            value={formData.title}
            onChange={handleInputChange('title')}
            error={errors.title}
            required
            maxLength={200}
          />

          {/* Description */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 text-gray-900 placeholder-gray-400 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Optional description for this session..."
              rows={3}
              value={formData.description}
              onChange={handleInputChange('description')}
            />
          </div>

          {/* Topic Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Number of Topics <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.topicCount}
                onChange={handleInputChange('topicCount')}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} topic{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              {errors.topicCount && (
                <p className="mt-1.5 text-sm text-red-600">{errors.topicCount}</p>
              )}
            </div>

            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Time per Topic <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.topicDuration}
                onChange={handleInputChange('topicDuration')}
              >
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
                <option value={240}>4 minutes</option>
                <option value={300}>5 minutes</option>
                <option value={600}>10 minutes</option>
              </select>
              {errors.topicDuration && (
                <p className="mt-1.5 text-sm text-red-600">{errors.topicDuration}</p>
              )}
            </div>
          </div>

          {/* Assignment Info */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              과제 정보 <span className="text-gray-400 text-xs">(선택)</span>
            </label>
            <textarea
              className="w-full px-3 py-2 text-gray-900 placeholder-gray-400 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="AI 분석 및 질문 생성에 활용될 과제 관련 정보를 입력하세요. 예: 과제 목표, 핵심 키워드, 평가 기준 등..."
              rows={3}
              value={formData.assignmentInfo}
              onChange={handleInputChange('assignmentInfo')}
            />
            <p className="mt-1 text-xs text-gray-500">
              이 정보는 주제 분석 및 인터뷰 질문 생성 시 참고됩니다
            </p>
          </div>

          {/* Interview Mode */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Interview Mode <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'student_choice', label: 'Student Choice', desc: 'Students decide' },
                { value: 'chat', label: 'Chat Only', desc: 'Text-based' },
                { value: 'voice', label: 'Voice Only', desc: 'Audio-based' },
              ].map((mode) => (
                <label
                  key={mode.value}
                  className={`
                    flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-colors
                    ${
                      formData.interviewMode === mode.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="interviewMode"
                    value={mode.value}
                    checked={formData.interviewMode === mode.value}
                    onChange={handleInputChange('interviewMode')}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-gray-900">{mode.label}</span>
                  <span className="text-xs text-gray-500">{mode.desc}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Session
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default CreateSessionModal;
