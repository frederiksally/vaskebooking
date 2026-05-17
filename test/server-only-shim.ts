// Vitest shim for `server-only`. The real module throws on import; in tests
// we just want a no-op so server-marked modules can be imported under Node.
export {}
