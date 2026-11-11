import { resolveArtistCandidatesViaAI } from '../services/geminiService.js';
import { readFileSync } from 'fs';

global.window = undefined;
process.env.GEMINI_API_KEY = readFileSync('.env', 'utf-8').split('\n').find(l => l.startsWith('GEMINI_API_KEY=')).split('=')[1].trim();

async function test() {
  console.log('Testing resolveArtistCandidatesViaAI...');
  const candidates = await resolveArtistCandidatesViaAI('Spaced');
  console.log('Candidates:', candidates);
}
test();
