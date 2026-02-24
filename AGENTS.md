This application is **NOT live**. You may break implementations and interfaces to pursue clean code. **Backward compatibility is not required.**

## Universal Rules

### Forbidden Patterns
- No `as any`
- No `@ts-ignore` / `@ts-expect-error` — fix types instead
- No empty `catch` blocks — handle or propagate errors
- No decorative comment dividers (e.g., `// ====`, `// ----`)

### Comments
- Explain **why**, never **what**
- Prefer inline comments (same line) when possible
- Use JSDoc only for public APIs

Example:
```ts
const timeout = 5000; // ms - API has undocumented 3s minimum
```

### Bugfixing

Prefer deleting code over adding code. Assume the bug is in existing code.

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `bunx effect-solutions list` to see available guides
2. Run `bunx effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `ai/.reference/effect/` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
