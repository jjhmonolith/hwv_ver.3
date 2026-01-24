'use client';

import Link from 'next/link';
import { BookOpen, GraduationCap } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-gray-50">
      {/* Logo and Title */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          HW Validator
        </h1>
        <p className="text-xl text-gray-600">
          AI 기반 과제 검증 인터뷰 시스템
        </p>
      </div>

      {/* Entry Cards */}
      <div className="flex flex-col sm:flex-row gap-6 mb-12">
        {/* Teacher Entry */}
        <Link
          href="/teacher/login"
          className="group flex flex-col items-center p-8 bg-white border-2 border-gray-200 rounded-2xl shadow-sm hover:border-blue-500 hover:shadow-lg transition-all duration-200 w-64"
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
            <BookOpen className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            교사로 시작
          </h2>
          <p className="text-gray-500 text-center text-sm">
            세션 생성 및 관리
          </p>
        </Link>

        {/* Student Entry */}
        <Link
          href="/join"
          className="group flex flex-col items-center p-8 bg-white border-2 border-gray-200 rounded-2xl shadow-sm hover:border-green-500 hover:shadow-lg transition-all duration-200 w-64"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
            <GraduationCap className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            학생으로 참여
          </h2>
          <p className="text-gray-500 text-center text-sm">
            접근 코드로 세션 참가
          </p>
        </Link>
      </div>

      {/* Service Info */}
      <div className="max-w-lg text-center">
        <h3 className="text-lg font-medium text-gray-700 mb-4">
          서비스 이용 안내
        </h3>
        <ul className="text-gray-500 space-y-2 text-sm">
          <li className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            교사: 세션을 생성하고 학생들의 인터뷰를 관리합니다
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            학생: 접근 코드를 입력하여 인터뷰에 참가합니다
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
            AI가 과제에 대한 질문을 하고 답변을 평가합니다
          </li>
        </ul>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-4 text-center text-gray-400 text-sm">
        HW Validator ver.3
      </footer>
    </main>
  );
}
