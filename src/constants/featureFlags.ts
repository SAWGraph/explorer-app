function readFlag(name: string, fallback: boolean): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const v = env?.[name];
  if (v == null) return fallback;
  return v === 'true' || v === '1';
}

// Route downstream samples-near-facilities through a single federated query
// instead of the per-endpoint chain that inlines S2 cell lists between steps.
export const USE_FEDERATED_DOWNSTREAM = readFlag(
  'VITE_USE_FEDERATED_DOWNSTREAM',
  false,
);
