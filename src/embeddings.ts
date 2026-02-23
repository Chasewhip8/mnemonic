import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';

let extractor: FeatureExtractionPipeline | null = null;

export async function initEmbeddings(): Promise<void> {
  try {
    console.log('Loading embedding model...');
    extractor = await pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX', {
      device: 'cpu',
      dtype: 'fp32',
    }) as FeatureExtractionPipeline;
    console.log('Embedding model loaded');
  } catch (error) {
    console.error('Embedding model loading error:', error);
    throw error;
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  try {
    if (!extractor) {
      throw new Error('Embedding model not initialized. Call initEmbeddings() first.');
    }
    const output = await extractor(text, { pooling: 'cls', normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (error) {
    console.error('Embedding creation error:', error);
    throw error;
  }
}
