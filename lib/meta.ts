// Cliente mínimo da Graph API (WhatsApp Business Platform)
export class MetaError extends Error {
  constructor(message: string, public code?: number, public details?: string) { super(message); }
}

export class Graph {
  constructor(private token: string, private version = "v26.0") {}

  base() {
    return process.env.META_GRAPH_BASE || `https://graph.facebook.com/${this.version}`;
  }

  url(path: string) {
    return path.startsWith("http") ? new URL(path) : new URL(`${this.base()}/${path.replace(/^\//, "")}`);
  }

  async call<T = any>(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
    const url = this.url(path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      const e = body?.error || {};
      throw new MetaError(`${e.message || res.statusText} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
    }
    return body as T;
  }

  /** POST com corpo JSON (envio de mensagens, marcação de lida etc.). */
  async json<T = any>(path: string, body: any): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const out: any = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) {
      const e = out?.error || {};
      throw new MetaError(`${e.message || res.statusText} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
    }
    return out as T;
  }

  /** POST multipart (upload de mídia). */
  async form<T = any>(path: string, form: FormData): Promise<T> {
    const res = await fetch(this.url(path), { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, body: form, cache: "no-store" });
    const out: any = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) {
      const e = out?.error || {};
      throw new MetaError(`${e.message || res.statusText} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
    }
    return out as T;
  }

  /** DELETE com query string (ex.: excluir template). */
  async delete<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = this.url(path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      const e = body?.error || {};
      throw new MetaError(`${e.message || res.statusText} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
    }
    return body as T;
  }

  /** Upload "retomável" (usado como exemplo de mídia na criação de templates). Devolve o handle "h:...". */
  async uploadHandle(appId: string, bytes: ArrayBuffer, mime: string, filename: string) {
    const session = await this.call<{ id: string }>(`${appId}/uploads`, { file_name: filename, file_length: String(bytes.byteLength), file_type: mime }, "POST");
    const res = await fetch(this.url(session.id), {
      method: "POST", headers: { Authorization: `OAuth ${this.token}`, file_offset: "0", "Content-Type": "application/octet-stream" }, body: bytes, cache: "no-store",
    });
    const out: any = await res.json().catch(() => ({}));
    if (!res.ok || out?.error || !out?.h) {
      const e = out?.error || {};
      throw new MetaError(`${e.message || res.statusText || "upload falhou"} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
    }
    return out.h as string;
  }

  /** Baixa um binário autenticado (URL de mídia). */
  async download(url: string) {
    return fetch(url, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
  }

  get<T = any>(path: string, params: Record<string, string> = {}) { return this.call<T>(path, params); }
  post<T = any>(path: string, params: Record<string, string> = {}) { return this.call<T>(path, params, "POST"); }

  /** Percorre todas as páginas de uma edge (data + paging.next). */
  async all<T = any>(path: string, params: Record<string, string> = {}, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let page: any = await this.get(path, { limit: "100", ...params });
    for (let i = 0; i < maxPages; i++) {
      out.push(...(page.data || []));
      const next = page?.paging?.next;
      if (!next) break;
      page = await this.get(next);
    }
    return out;
  }
}

export const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** Dia (YYYY-MM-DD) de um bucket diário a partir do ponto médio — funciona com recortes em UTC ou no fuso da conta. */
export function bucketDay(start: number, end?: number) {
  const mid = end ? (start + end) / 2 : start + 12 * 3600;
  return new Date(mid * 1000).toISOString().slice(0, 10);
}
