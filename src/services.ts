import { Layer } from 'effect';
import { AppConfig } from './config';
import { DatabaseLive } from './database';
import { EmbeddingService } from './embeddings';
import { LearningsRepo } from './learnings/repo';
import { SecretsRepo } from './secrets/repo';
import { StateRepo } from './state/repo';
import { CleanupService } from './cleanup';

export const InfraLive = Layer.mergeAll(
	DatabaseLive,
	EmbeddingService.Default,
	AppConfig.Default,
);
export const LearningsRepoLive = LearningsRepo.Default.pipe(
	Layer.provide(InfraLive),
);
export const SecretsRepoLive = SecretsRepo.Default.pipe(
	Layer.provide(DatabaseLive),
);
export const StateRepoLive = StateRepo.Default.pipe(
	Layer.provide(LearningsRepoLive),
	Layer.provide(DatabaseLive),
);
export const CleanupServiceLive = CleanupService.Default.pipe(
	Layer.provide(DatabaseLive),
	Layer.provide(AppConfig.Default),
);
export const ServicesLive = Layer.mergeAll(
	LearningsRepoLive,
	SecretsRepoLive,
	StateRepoLive,
	CleanupServiceLive,
);
export const AppLive = Layer.mergeAll(InfraLive, ServicesLive);
