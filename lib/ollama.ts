// Ollama API client for chat completion
// Usage: import { getOllamaChatCompletion } from './ollama';

const OLLAMA_API_URL = 'http://localhost:11434/api/chat';
const OLLAMA_API_KEY = import.meta.env.VITE_OLLAMA_API_KEY || '';

export async function getOllamaChatCompletion(messages) {
  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama3', // or another Ollama model name
      messages,
      stream: false
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }
  const data = await response.json();
  return data;
}
