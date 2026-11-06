"use client";
// Catálogo (listas, tags, números, templates…) com cópia na sessão do navegador:
// a tela aparece na hora com a última versão conhecida e é atualizada em seguida pela rede.
// a cópia é separada por usuário e por visão (o layout marca <div data-cat="<usuário>.<visão>">), para nada vazar entre contas
const key = () => {
  let tag = "x";
  try { tag = (document.querySelector("[data-cat]") as HTMLElement | null)?.dataset.cat || "x"; } catch { /* fora do navegador */ }
  return `hub.catalogo.v2.${tag}`;
};

function readCache(): any | null {
  try { const raw = sessionStorage.getItem(key()); return raw ? JSON.parse(raw).data : null; } catch { return null; }
}

/** Entrega o catálogo em cache (se houver) e depois a versão fresca. Rejeita só se não houver nada para mostrar. */
export function loadCatalog<T = any>(set: (c: T) => void, onError?: (e: Error) => void) {
  const cached = readCache();
  if (cached) set(cached);
  return fetch("/api/catalogo", { cache: "no-store" })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erro ${r.status}`); return j; })
    .then((data) => { set(data); try { sessionStorage.setItem(key(), JSON.stringify({ t: Date.now(), data })); } catch { /* sem espaço */ } return data as T; })
    .catch((e) => { if (!cached) onError?.(e); return cached as T; });
}

/** Depois de criar lista/tag/número etc.: descarta a cópia local. */
export function invalidateCatalog() {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith("hub.catalogo.")) sessionStorage.removeItem(k); } catch { /* ignorado */ }
}
