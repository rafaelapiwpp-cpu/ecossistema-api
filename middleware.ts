import { NextResponse, type NextRequest } from "next/server";

/**
 * Raiz do site: quem chega sem sessão vê a página pública do Ecossistema API (/sobre),
 * com o endereço "/" mantido; quem tem o cookie de sessão segue para o painel,
 * que continua validando a sessão e mandando para /login quando preciso.
 * O nome do cookie é o COOKIE de lib/auth.ts (lib/auth.ts usa "crypto" e o banco, por isso não é importado aqui).
 */
const SESSION_COOKIE = "pw_session";

export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  return NextResponse.rewrite(new URL("/sobre", req.url));
}

export const config = { matcher: "/" };
