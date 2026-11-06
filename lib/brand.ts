/**
 * Marca e dados de quem opera o sistema (aparecem no painel e nas páginas públicas /sobre, /termos,
 * /privacidade e /exclusao-de-dados, que a Meta exige no cadastro do app).
 *
 * PREENCHER: `legal` e `contactEmail` com os dados da empresa que opera o Ecossistema API.
 * Enquanto estiverem vazios, as páginas públicas escondem esses campos.
 */
export const BRAND = {
  name: "Ecossistema API",
  tagline: "Atendimento, disparos, fluxos e templates na API Oficial do WhatsApp",
  /** E-mail de contato e de pedidos de exclusão de dados (LGPD). */
  contactEmail: "",
  legal: {
    /** Razão social. */
    name: "",
    cnpj: "",
    address: [] as string[],
    phone: "",
  },
};

/** Quem opera o sistema, para os textos legais: a razão social quando preenchida, senão o nome do produto. */
export const OPERATOR = BRAND.legal.name || BRAND.name;
