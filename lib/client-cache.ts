// Cache das telas no navegador (só no navegador — no servidor não guarda nada).
// Ao voltar para uma tela (Início, lista do Atendimento, conversa já aberta), ela aparece na hora com o último estado
// e se atualiza por trás.
type Entry = { at: number; data: unknown; stale: boolean };
const store = new Map<string, Entry>();
const MAX = 120;
const browser = () => typeof window !== "undefined";

export function cacheGet<T>(key: string): T | undefined {
  if (!browser()) return undefined;
  return store.get(key)?.data as T | undefined;
}

/** Idade em ms (Infinity se não houver) e se foi marcado como desatualizado. */
export function cacheInfo(key: string): { age: number; stale: boolean } {
  const e = browser() ? store.get(key) : undefined;
  return e ? { age: Date.now() - e.at, stale: e.stale } : { age: Infinity, stale: true };
}

export function cacheSet(key: string, data: unknown) {
  if (!browser()) return;
  store.delete(key);
  store.set(key, { at: Date.now(), data, stale: false });
  while (store.size > MAX) store.delete(store.keys().next().value as string); // sai o mais antigo
}

export function cacheStale(key: string) {
  const e = store.get(key);
  if (e) e.stale = true;
}

/** Guarda também na sessão do navegador (sobrevive a um F5) — só para dados pequenos. */
export function sessionSave(key: string, data: unknown) {
  if (!browser()) return;
  try { sessionStorage.setItem(`hub.c.${key}`, JSON.stringify(data)); } catch { /* sem espaço ou bloqueado */ }
}

export function sessionLoad<T>(key: string): T | undefined {
  if (!browser()) return undefined;
  try { const v = sessionStorage.getItem(`hub.c.${key}`); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; }
}
