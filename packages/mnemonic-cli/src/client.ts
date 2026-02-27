import { ConfigProvider, Layer } from 'effect'
import { MnemonicClient } from '../../mnemonic-client/src/index.ts'

export const makeClientLayer = (opts: { url?: string; apiKey?: string | undefined }) => {
	const map = new Map<string, string>()
	if (opts.url !== undefined) map.set('MNEMONIC_URL', opts.url)
	if (opts.apiKey !== undefined) map.set('MNEMONIC_API_KEY', opts.apiKey)

	const overrideProvider = ConfigProvider.fromMap(map).pipe(
		ConfigProvider.orElse(() => ConfigProvider.fromEnv()),
	)

	return MnemonicClient.Default.pipe(Layer.provide(Layer.setConfigProvider(overrideProvider)))
}

const hasTag = (error: unknown): error is { readonly _tag: string } =>
	typeof error === 'object' && error !== null && '_tag' in error

const hasMessage = (error: unknown): error is { readonly message: string } =>
	typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string'

const isConnectionError = (error: unknown, url?: string): boolean => {
	if (!(error instanceof Error)) return false
	const msg = error.message
	return (
		msg.includes('ECONNREFUSED') ||
		msg.includes('fetch') ||
		(url !== undefined && msg.includes(url))
	)
}

export const formatApiError = (error: unknown, url?: string): string => {
	if (isConnectionError(error, url)) {
		return `Error: Could not connect to ${url ?? 'server'}`
	}

	if (!hasTag(error)) {
		return error instanceof Error ? `Error: ${error.message}` : 'Error: An unexpected error occurred'
	}

	switch (error._tag) {
		case 'Unauthorized':
			return 'Error: Authentication failed. Check --api-key or MNEMONIC_API_KEY.'
		case 'NotFoundError':
		case 'ValidationError':
			return `Error: ${hasMessage(error) ? error.message : error._tag}`
		case 'DatabaseError':
			return 'Error: Database error'
		case 'EmbeddingError':
			return 'Error: Embedding generation failed'
		default:
			return `Error: ${hasMessage(error) ? error.message : error._tag}`
	}
}
