import { ConfigProvider, Layer } from 'effect'
import {
	DatabaseError,
	EmbeddingError,
	MnemonicClient,
	NotFoundError,
	Unauthorized,
	ValidationError,
} from '../../mnemonic-client/src/index.ts'

export const makeClientLayer = (opts: {
	url?: string
	apiKey?: string | undefined
}): Layer.Layer<MnemonicClient> => {
	const map = new Map<string, string>()
	if (opts.url !== undefined) map.set('MNEMONIC_URL', opts.url)
	if (opts.apiKey !== undefined) map.set('MNEMONIC_API_KEY', opts.apiKey)

	const overrideProvider = ConfigProvider.fromMap(map).pipe(
		ConfigProvider.orElse(() => ConfigProvider.fromEnv()),
	)

	return MnemonicClient.Default.pipe(Layer.provide(Layer.setConfigProvider(overrideProvider)))
}

export const formatApiError = (error: unknown, url?: string): string => {
	if (error instanceof Unauthorized) {
		return 'Error: Authentication failed. Check --api-key or MNEMONIC_API_KEY.'
	}
	if (error instanceof NotFoundError) {
		return `Error: ${error.message}`
	}
	if (error instanceof ValidationError) {
		return `Error: ${error.message}`
	}
	if (error instanceof DatabaseError) {
		return 'Error: Database error'
	}
	if (error instanceof EmbeddingError) {
		return 'Error: Embedding generation failed'
	}
	// Connection/fetch errors
	if (error instanceof Error) {
		const msg = error.message
		if (
			msg.includes('ECONNREFUSED') ||
			msg.includes('fetch') ||
			(url !== undefined && msg.includes(url))
		) {
			return `Error: Could not connect to ${url ?? 'server'}`
		}
	}
	return `Error: ${String(error)}`
}
