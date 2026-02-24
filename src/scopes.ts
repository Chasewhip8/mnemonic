export function filterScopesByPriority(scopes: ReadonlyArray<string>): string[] {
	const priority = ['session:', 'agent:', 'shared']

	for (const prefix of priority) {
		const matches = scopes.filter((scope) => scope.startsWith(prefix))
		if (matches.length > 0) {
			return matches
		}
	}

	return scopes.includes('shared') ? ['shared'] : []
}
