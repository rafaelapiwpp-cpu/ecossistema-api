'use client';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

export interface LinkProps { href: string; className?: string; children: ReactNode; title?: string; onClick?: (e: MouseEvent) => void }

const Link = ({ href, className, children, title, onClick }: LinkProps) => (
  <NextLink href={href} className={className} title={title} onClick={onClick}>{children}</NextLink>
);

/** Navegação das telas de disparos (rotas na raiz do admin: /campanhas, /fluxos, /contatos). */
export function useNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  return { Link, push: (h: string) => router.push(h), pathname, to: (p: string) => p };
}
