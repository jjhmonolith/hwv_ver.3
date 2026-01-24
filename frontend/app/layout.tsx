import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'HW Validator - AI 기반 과제 검증 시스템',
  description: '학생이 제출한 과제물에 대해 AI 기반 인터뷰를 진행하여 과제 작성 여부를 검증하는 시스템',
  keywords: ['AI', '과제 검증', '인터뷰', '교육', '학습'],
  authors: [{ name: 'HW Validator Team' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
