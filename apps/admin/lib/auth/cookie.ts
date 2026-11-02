/**
 * Nome do cookie de sessão do painel. Separado de sessao.ts para o proxy.ts
 * poder importar sem puxar o Prisma.
 *
 * `__Host-` exige Secure + Path=/ + sem Domain: o navegador recusa o cookie se
 * alguém tentar definí-lo de um subdomínio ou por HTTP. Em `next dev` (http) o
 * prefixo não funciona, então o nome muda.
 */
export const COOKIE_SESSAO = process.env.NODE_ENV === "production" ? "__Host-eco_admin" : "eco_admin_dev";
