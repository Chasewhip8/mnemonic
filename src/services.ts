import { Layer } from 'effect'
import { CleanupService } from './cleanup'
import { AppConfig } from './config'
import { DatabaseLive } from './database'
import { EmbeddingService } from './embeddings'
import { LearningsRepo } from './learnings/repo'

export const InfraLive = Layer.mergeAll(DatabaseLive, EmbeddingService.Default, AppConfig.Default)
export const LearningsRepoLive = LearningsRepo.Default.pipe(Layer.provide(InfraLive))
export const CleanupServiceLive = CleanupService.Default.pipe(
	Layer.provide(DatabaseLive),
	Layer.provide(AppConfig.Default),
)
export const ServicesLive = Layer.mergeAll(LearningsRepoLive, CleanupServiceLive)
export const AppLive = Layer.mergeAll(InfraLive, ServicesLive)
