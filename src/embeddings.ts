import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { Effect } from 'effect';
import { EmbeddingError } from './errors.ts';

export class EmbeddingService extends Effect.Service<EmbeddingService>()('EmbeddingService', {
  scoped: Effect.gen(function* () {
    yield* Effect.logInfo('Loading embedding model...');

    const extractor = yield* Effect.tryPromise({
      try: () =>
        pipeline('feature-extraction', 'onnx-community/bge-small-en-v1.5-ONNX', {
          device: 'cpu',
          dtype: 'fp32',
        }) as Promise<FeatureExtractionPipeline>,
      catch: (error) => new EmbeddingError({ cause: error }),
    });

    yield* Effect.logInfo('Embedding model loaded');

    const embed = Effect.fn('EmbeddingService.embed')(function* (text: string) {
      return yield* Effect.tryPromise({
        try: async () => {
          const output = await extractor(text, { pooling: 'cls', normalize: true });
          return Array.from(output.data as Float32Array);
        },
        catch: (error) => new EmbeddingError({ cause: error }),
      });
    });

    return { embed };
  }),
}) {}
