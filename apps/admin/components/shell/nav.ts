import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Telas ainda não construídas aparecem desabilitadas, mostrando o mapa do produto. */
  ready: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/", label: "Visão geral", icon: "overview", ready: true }],
  },
  {
    label: "Operação",
    items: [
      { href: "/clientes", label: "Clientes", icon: "clients", ready: false },
      { href: "/bms", label: "Business Managers", icon: "businessManager", ready: true },
      { href: "/numeros", label: "Números", icon: "phone", ready: true },
      { href: "/templates", label: "Templates", icon: "template", ready: true },
      { href: "/campanhas", label: "Campanhas", icon: "campaign", ready: false },
    ],
  },
  {
    label: "Conformidade",
    items: [
      { href: "/contatos", label: "Contatos e opt-out", icon: "contacts", ready: false },
      { href: "/auditoria", label: "Auditoria", icon: "audit", ready: false },
    ],
  },
  {
    label: "Plataforma",
    items: [{ href: "/infra", label: "Infraestrutura", icon: "infra", ready: false }],
  },
];
