/**
 * Jest Setup File
 * Global mocks for Web APIs used in voice interview features
 */

import '@testing-library/jest-dom';

// ========================================
// Audio API Mock
// ========================================

interface MockAudio {
  play: jest.Mock;
  pause: jest.Mock;
  onended: (() => void) | null;
  onerror: ((error: Event) => void) | null;
  src: string;
}

const createMockAudio = (): MockAudio => ({
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  onended: null,
  onerror: null,
  src: '',
});

global.Audio = jest.fn(() => createMockAudio()) as unknown as typeof Audio;

// ========================================
// URL API Mock
// ========================================

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// ========================================
// MediaRecorder API Mock
// ========================================

interface MockMediaRecorder {
  start: jest.Mock;
  stop: jest.Mock;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  state: 'inactive' | 'recording' | 'paused';
}

const createMockMediaRecorder = (): MockMediaRecorder => ({
  start: jest.fn(function (this: MockMediaRecorder) {
    this.state = 'recording';
  }),
  stop: jest.fn(function (this: MockMediaRecorder) {
    this.state = 'inactive';
    // Trigger ondataavailable with mock data
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['mock-audio'], { type: 'audio/webm' }) });
    }
    // Trigger onstop
    if (this.onstop) {
      setTimeout(() => this.onstop?.(), 0);
    }
  }),
  ondataavailable: null,
  onstop: null,
  state: 'inactive',
});

global.MediaRecorder = jest.fn(() => createMockMediaRecorder()) as unknown as typeof MediaRecorder;

// ========================================
// AudioContext API Mock
// ========================================

interface MockAnalyserNode {
  fftSize: number;
  frequencyBinCount: number;
  getByteFrequencyData: jest.Mock;
  connect: jest.Mock;
}

interface MockAudioContext {
  createAnalyser: jest.Mock<MockAnalyserNode>;
  createMediaStreamSource: jest.Mock;
  close: jest.Mock;
  state: 'running' | 'closed' | 'suspended';
}

const createMockAnalyser = (): MockAnalyserNode => ({
  fftSize: 256,
  frequencyBinCount: 128,
  getByteFrequencyData: jest.fn((array: Uint8Array) => {
    // Fill with mock frequency data (half volume)
    for (let i = 0; i < array.length; i++) {
      array[i] = 64;
    }
  }),
  connect: jest.fn(),
});

const createMockAudioContext = (): MockAudioContext => ({
  createAnalyser: jest.fn(() => createMockAnalyser()),
  createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
  close: jest.fn(),
  state: 'running',
});

global.AudioContext = jest.fn(() => createMockAudioContext()) as unknown as typeof AudioContext;

// ========================================
// MediaDevices API Mock
// ========================================

const createMockMediaStream = () => ({
  getTracks: () => [{ stop: jest.fn() }],
});

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue(createMockMediaStream()),
  },
});

// ========================================
// Permissions API Mock
// ========================================

Object.defineProperty(navigator, 'permissions', {
  writable: true,
  value: {
    query: jest.fn().mockResolvedValue({ state: 'granted' }),
  },
});

// ========================================
// requestAnimationFrame Mock
// ========================================

let animationFrameId = 0;
global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
  animationFrameId++;
  setTimeout(() => callback(performance.now()), 16);
  return animationFrameId;
});

global.cancelAnimationFrame = jest.fn();

// ========================================
// Fetch Mock Helper
// ========================================

export const mockFetch = (response: unknown, ok = true) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
    blob: () => Promise.resolve(new Blob(['mock-audio'], { type: 'audio/mpeg' })),
  });
};

export const mockFetchError = (errorMessage: string) => {
  global.fetch = jest.fn().mockRejectedValue(new Error(errorMessage));
};

// ========================================
// Console Mock (suppress expected errors)
// ========================================

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn((...args) => {
    // Suppress expected error messages during tests
    const message = args[0]?.toString() || '';
    if (
      message.includes('TTS error:') ||
      message.includes('STT error:') ||
      message.includes('Microphone access error:')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  });
});

afterAll(() => {
  console.error = originalConsoleError;
});

// ========================================
// Cleanup between tests
// ========================================

afterEach(() => {
  jest.clearAllMocks();
});
