/**
 * Speech Service - TTS (ElevenLabs) + STT (OpenAI Whisper)
 * Phase 4b: Voice Interview
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import OpenAI from 'openai';
import { Readable } from 'stream';

// ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// OpenAI client (for Whisper STT)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Text-to-Speech using ElevenLabs
 * @param text - Text to convert to speech
 * @returns Audio buffer (MP3)
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '4JJwo477JUAx3HV0T7n7';
  const modelId = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

  try {
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: modelId,
      outputFormat: 'mp3_44100_128',
    });

    // Convert stream to buffer
    const chunks: Buffer[] = [];

    if (audio instanceof Readable) {
      for await (const chunk of audio) {
        chunks.push(Buffer.from(chunk));
      }
    } else if (typeof audio[Symbol.asyncIterator] === 'function') {
      for await (const chunk of audio) {
        chunks.push(Buffer.from(chunk));
      }
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error('TTS Error:', error);
    throw new Error('Failed to generate speech');
  }
}

/**
 * Speech-to-Text using OpenAI Whisper
 * @param audioBuffer - Audio data (webm, mp3, wav, etc.)
 * @param context - Optional context hint for better recognition
 * @returns Transcribed text
 */
export async function speechToText(
  audioBuffer: Buffer,
  context?: string
): Promise<string> {
  try {
    // Create a File object from buffer (convert to Uint8Array for compatibility)
    const uint8Array = new Uint8Array(audioBuffer);
    const file = new File([uint8Array], 'audio.webm', { type: 'audio/webm' });

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ko',
      prompt: context, // Context-aware hint for better accuracy
    });

    return response.text;
  } catch (error) {
    console.error('STT Error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

/**
 * Check if speech services are available
 */
export function checkSpeechServices(): {
  tts: { available: boolean; provider: string };
  stt: { available: boolean; provider: string };
} {
  const ttsAvailable = !!(
    process.env.ELEVENLABS_API_KEY &&
    process.env.ELEVENLABS_VOICE_ID
  );

  const sttAvailable = !!process.env.OPENAI_API_KEY;

  return {
    tts: {
      available: ttsAvailable,
      provider: 'ElevenLabs',
    },
    stt: {
      available: sttAvailable,
      provider: 'OpenAI Whisper',
    },
  };
}
