/**
 * Local Embedding Engine using Transformers.js
 * Generates 384-dimension vectors using Xenova/all-MiniLM-L6-v2
 * Completely free — no API key needed, runs in-browser via WASM/WebGPU
 */

import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';

let extractorInstance: FeatureExtractionPipeline | null = null;
let isLoading = false;
let loadPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Get or create the singleton embedding pipeline.
 * The model (~23MB) is cached in the browser after first download.
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractorInstance) return extractorInstance;
  if (loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    // @ts-ignore - dtype option for quantized model
    dtype: 'fp32',
  }).then((extractor) => {
    extractorInstance = extractor as FeatureExtractionPipeline;
    isLoading = false;
    return extractorInstance;
  }).catch((err) => {
    isLoading = false;
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

/**
 * Generate a 384-dimension embedding vector for the given text.
 * Uses mean pooling + normalization for optimal semantic similarity.
 */
export async function getLocalEmbedding(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

/**
 * Check if the embedding model is currently loading.
 */
export function isEmbeddingModelLoading(): boolean {
  return isLoading;
}

/**
 * Check if the embedding model is ready.
 */
export function isEmbeddingModelReady(): boolean {
  return extractorInstance !== null;
}
