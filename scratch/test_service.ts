import { resolveArtistCandidatesViaAI } from './services/geminiService';
import { readFileSync } from 'fs';

// Mock window to set baseUrl correctly
global.window = undefined;

// Load env
const envFile = readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, val] = line.split('=');
    env[key.trim()] = val.trim();
  }
});
process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

async function test() {
  console.log('Testing resolveArtistCandidatesViaAI("Spaced")...');
  const candidates = await resolveArtistCandidatesViaAI('Spaced');
  console.log('Candidates:', candidates);
}

test();
