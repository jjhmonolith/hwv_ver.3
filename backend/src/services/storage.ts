import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'submissions';

/**
 * Upload a file to Supabase Storage
 * @param buffer - File buffer
 * @param filename - Original filename
 * @param sessionId - Session UUID
 * @param participantId - Participant UUID
 * @returns Storage path
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  sessionId: string,
  participantId: string
): Promise<string> {
  const client = getSupabaseClient();

  // Generate unique path: sessions/{sessionId}/{participantId}/{timestamp}_{filename}
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
  const path = `sessions/${sessionId}/${participantId}/${Date.now()}_${sanitizedFilename}`;

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  console.log(`[Storage] File uploaded successfully: ${path}`);
  return path;
}

/**
 * Download a file from Supabase Storage
 * @param path - Storage path
 * @returns File buffer
 */
export async function downloadFile(path: string): Promise<Buffer> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .download(path);

  if (error) {
    console.error('[Storage] Download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Get a signed URL for temporary access (1 hour)
 * @param path - Storage path
 * @returns Signed URL
 */
export async function getSignedUrl(path: string): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 3600); // 1 hour

  if (error) {
    console.error('[Storage] Signed URL error:', error);
    throw new Error(`Failed to get signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Check if storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export default {
  uploadFile,
  downloadFile,
  getSignedUrl,
  isStorageConfigured,
};
