import { defineConfig, devices } from '@playwright/test';

/**
 * HWV Ver.3 Playwright E2E Test Configuration
 * Phase 3: Student Join Flow Testing
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000, // 60초 (PDF 업로드/분석 시간 고려)
  expect: {
    timeout: 10000, // 10초
  },
  fullyParallel: false, // 순차 실행 (상태 의존적 테스트)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 단일 워커 (세션 상태 충돌 방지)
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Bypass autoplay restrictions for voice tests
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
        // Grant permissions
        permissions: ['microphone'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3010',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
