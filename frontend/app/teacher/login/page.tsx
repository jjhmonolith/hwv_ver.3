'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTeacherStore, Teacher } from '@/lib/store';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type TabType = 'login' | 'register';

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const initialFormData: FormData = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function TeacherLoginPage() {
  const router = useRouter();
  const { token, setToken, setTeacher } = useTeacherStore();

  const [activeTab, setActiveTab] = useState<TabType>('login');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (token) {
      router.replace('/teacher/dashboard');
    }
  }, [token, router]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (activeTab === 'register' && !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (activeTab === 'register') {
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      let result;

      if (activeTab === 'login') {
        result = await api.auth.login(formData.email, formData.password);
      } else {
        result = await api.auth.register(
          formData.email,
          formData.password,
          formData.name
        );
      }

      const { token: newToken, teacher } = result as {
        token: string;
        teacher: Teacher;
      };

      setToken(newToken);
      setTeacher(teacher);

      router.push('/teacher/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        setApiError(error.message);
      } else {
        setApiError('An unexpected error occurred');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange =
    (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setFormData(initialFormData);
    setErrors({});
    setApiError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HW Validator</h1>
          <p className="mt-2 text-gray-600">Teacher Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={cn(
                'flex-1 py-4 text-center font-medium transition-colors',
                activeTab === 'login'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={cn(
                'flex-1 py-4 text-center font-medium transition-colors',
                activeTab === 'register'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {apiError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {apiError}
              </div>
            )}

            {activeTab === 'register' && (
              <Input
                label="Name"
                type="text"
                placeholder="Your name"
                value={formData.name}
                onChange={handleInputChange('name')}
                error={errors.name}
                required
                disabled={isSubmitting}
              />
            )}

            <Input
              label="Email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={handleInputChange('email')}
              error={errors.email}
              required
              disabled={isSubmitting}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleInputChange('password')}
              error={errors.password}
              required
              disabled={isSubmitting}
            />

            {activeTab === 'register' && (
              <Input
                label="Confirm Password"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                error={errors.confirmPassword}
                required
                disabled={isSubmitting}
              />
            )}

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              className="mt-6"
            >
              {activeTab === 'login' ? 'Login' : 'Create Account'}
            </Button>
          </form>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
