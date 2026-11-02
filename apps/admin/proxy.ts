import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO } from "@/lib/auth/cookie";

/**
 * Barreira de entrada do painel (Next 16: `proxy.ts`, antigo `middleware.ts`).
 *
 * Aqui só se olha se o cookie de sessão EXISTE — é barato e roda antes de tudo,
 * inclusive de rotas novas que alguém esqueça de proteger. A validação de verdade
 * (sessão no banco, expiração, permVersion, permissão) é feita por
 * `exigirOperador()` em cada página e em cada Server Action.
 *
 * Fica de fora: a tela de login, os arquivos do Next e o webhook da Meta
 * (autenticado pela assinatura X-Hub-Signature-256, não por sessão).
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (req.cookies.has(COOKIE_SESSAO)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?de=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/webhooks/|_next/static|_next/image|favicon\\.ico|robots\\.txt).*)"],
};
