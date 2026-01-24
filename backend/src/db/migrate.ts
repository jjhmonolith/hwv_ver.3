import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection, pool } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate(): Promise<void> {
  console.log('Starting database migration...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot connect to database. Please check your DATABASE_URL.');
    process.exit(1);
  }

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema...\n');

    // Execute the entire schema
    await query(schema);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nCreated:');
    console.log('  - 5 ENUM types (session_status, interview_mode, participant_status, interview_phase, conversation_role)');
    console.log('  - 5 tables (teachers, assignment_sessions, student_participants, interview_states, interview_conversations)');
    console.log('  - Indexes for performance');
    console.log('  - Triggers for auto-updating timestamps');
    console.log('  - Functions for generating access codes and session tokens');

  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a "already exists" error
      if (error.message.includes('already exists')) {
        console.log('⚠️  Some objects already exist. Skipping...');
        console.log('   To reset the database, run: DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      } else {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
      }
    } else {
      throw error;
    }
  } finally {
    // Close the pool
    await pool.end();
    console.log('\nDatabase connection closed.');
  }
}

// Run migration
migrate().catch(console.error);
