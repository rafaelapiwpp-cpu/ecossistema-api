import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, OPERATOR } from "@/lib/brand";
import "./sobre.css";

/* Página pública do Ecossistema API (o que é o serviço, como usa os dados e quem o opera).
   Quem abre a raiz "/" sem estar logado vê esta página (middleware.ts); quem está logado vai para o painel. */

export const metadata: Metadata = {
  title: `${BRAND.name} · Atendimento e campanhas no WhatsApp Business`,
  description: `O ${BRAND.name} é uma plataforma online para empresas enviarem campanhas, atenderem os seus clientes e acompanharem entregas e custos das suas contas do WhatsApp Business, pela API oficial. Operado por ${OPERATOR}.`,
};

type IconName = "send" | "chat" | "doc" | "chart" | "lock" | "bolt" | "check" | "mail" | "phone" | "pin" | "building" | "arrow";

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = {
    send: <><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></>,
    chat: <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z" />,
    doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
    phone: <path d="M6.6 3.6 9 3l2 4.6-2.2 1.6a12 12 0 0 0 6 6L16.4 13 21 15l-.6 2.4a2.6 2.6 0 0 1-2.8 2A17 17 0 0 1 4.6 6.4a2.6 2.6 0 0 1 2-2.8Z" />,
    pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "send", title: "Campanhas e mensagens", text: "Envie as mensagens e campanhas aprovadas pela sua empresa, com modelos de mensagem aprovados pela Meta, e respostas automáticas configuradas por você." },
  { icon: "chat", title: "Caixa de atendimento", text: "As respostas dos seus clientes chegam numa caixa de atendimento: a equipe responde, faz notas internas, encerra cada conversa e acompanha os contatos num funil de vendas." },
  { icon: "doc", title: "Modelos de mensagem", text: "Crie modelos de mensagem e acompanhe o status de aprovação e a qualidade de cada um." },
  { icon: "chart", title: "Relatórios de envios e custos", text: "Acompanhe envios, entregas, leituras e custos de cada conta do WhatsApp Business, por dia e por campanha." },
  { icon: "lock", title: "Portal da sua empresa", text: "Cada empresa cliente entra pelo próprio endereço, com o logo e as cores dela. Cada pessoa tem login e senha e vê só as contas liberadas para ela." },
  { icon: "bolt", title: "API oficial do WhatsApp", text: "Integração com a API oficial do WhatsApp Business Platform, com modelos aprovados e notificações de entrega enviadas pela Meta." },
];

const STEPS = [
  { title: "A empresa compartilha as contas", text: "A empresa cliente compartilha conosco, como parceira no portfólio empresarial da Meta, as contas do WhatsApp Business que quer usar. Ela pode retirar esse acesso quando quiser." },
  { title: "A equipe recebe o acesso", text: "Criamos o acesso da empresa, com o logo e as cores dela, e os logins da equipe. Cada pessoa vê apenas as contas liberadas para ela." },
  { title: "Envie, atenda e acompanhe", text: "A equipe envia campanhas com modelos aprovados, responde os clientes na caixa de atendimento e acompanha os relatórios de entregas e custos." },
];

const DATA_USED = [
  "Contas e números do WhatsApp Business: nome, número, qualidade e limites de envio.",
  "Modelos de mensagem e o status de aprovação de cada um.",
  "Mensagens enviadas e recebidas pelas contas, com os status de entrega (enviada, entregue, lida ou com falha).",
  "Métricas e custos de mensagens informados pela Meta.",
];

const PROMISES = [
  "Usamos os dados só para prestar o serviço à própria empresa cliente.",
  "Não vendemos, não repassamos a terceiros e não usamos os dados para anúncios.",
  "Acesso por login e senha, conexão criptografada (HTTPS) e verificação da assinatura das notificações da Meta.",
  "A empresa pode retirar o acesso e pedir a exclusão dos dados a qualquer momento.",
];

export default function Sobre() {
  const { legal } = BRAND;
  const tel = legal.phone.replace(/[^\d+]/g, "");
  const mail = BRAND.contactEmail;
  const year = new Date().getFullYear();
  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-wrap">
          <Link href="/" className="lp-logo" aria-label={`${BRAND.name} — início`}>
            <img src="/logo-icon.webp" alt="" width={28} height={28} />
            <span>{BRAND.name}</span>
          </Link>
          <nav className="lp-nav" aria-label="Seções">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#dados">Dados e privacidade</a>
            <a href="#empresa">Empresa</a>
          </nav>
          <Link href="/login" className="lp-btn lp-btn-head">Entrar</Link>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-pill">API oficial do WhatsApp Business</p>
              <h1 id="lp-title">Atendimento e campanhas no WhatsApp, num só lugar.</h1>
              <p className="lp-lead">O {BRAND.name} é uma plataforma online para empresas enviarem campanhas, atenderem os seus clientes e acompanharem entregas e custos das suas contas do WhatsApp Business.</p>
              <div className="lp-cta">
                <Link href="/login" className="lp-btn lp-btn-light">Entrar na plataforma</Link>
                {mail && <a href={`mailto:${mail}`} className="lp-btn lp-btn-ghost">Fale conosco</a>}
              </div>
              {legal.name && <p className="lp-by">Um produto de {legal.name}{legal.cnpj && ` · CNPJ ${legal.cnpj}`}</p>}
            </div>

            <div className="lp-mock" aria-hidden="true">
              <div className="lp-chat">
                <div className="lp-chat-top">
                  <span className="lp-av">AS</span>
                  <div className="lp-chat-who"><b>Ana Souza</b><small>WhatsApp · Loja Centro</small></div>
                  <span className="lp-state">Em atendimento</span>
                </div>
                <div className="lp-chat-body">
                  <span className="lp-day">Hoje</span>
                  <div className="lp-b out tpl">
                    <em>Modelo aprovado · Marketing</em>
                    Olá, Ana! As ofertas da semana já estão no ar. Quer receber a lista completa?
                    <span className="lp-meta">10:02 · Lida</span>
                  </div>
                  <div className="lp-b in">Quero sim! Vocês entregam no meu bairro?<span className="lp-meta">10:05</span></div>
                  <div className="lp-b out">Entregamos, sim. Já te mando as opções.<span className="lp-meta">10:06 · Entregue</span></div>
                </div>
                <div className="lp-chat-compose"><span>Responder…</span><i><Icon name="arrow" size={14} /></i></div>
              </div>
              <div className="lp-stat">
                <small>Campanha “Ofertas da semana”</small>
                <b>98% entregues</b>
                <span className="lp-bar"><i /></span>
                <small>1.240 enviadas · 1.003 lidas</small>
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="lp-sec" aria-labelledby="lp-recursos">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Recursos</p>
            <h2 id="lp-recursos" className="lp-h2">Tudo o que a sua equipe precisa para conversar com os clientes no WhatsApp.</h2>
            <div className="lp-grid">
              {FEATURES.map((f) => (
                <article key={f.title} className="lp-card">
                  <span className="lp-ico"><Icon name={f.icon} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="lp-sec lp-alt" aria-labelledby="lp-como">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Como funciona</p>
            <h2 id="lp-como" className="lp-h2">Em três passos, a sua empresa começa a usar.</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="dados" className="lp-sec" aria-labelledby="lp-dados">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Dados e privacidade</p>
            <h2 id="lp-dados" className="lp-h2">Como usamos os dados da plataforma.</h2>
            <p className="lp-sub">O {BRAND.name} só acessa as contas do WhatsApp Business que a empresa cliente compartilha conosco, e usa esses dados apenas para prestar o serviço a ela.</p>
            <div className="lp-two">
              <div className="lp-card lp-list">
                <h3>Dados que usamos</h3>
                <ul>{DATA_USED.map((t) => <li key={t}><span className="lp-dot" aria-hidden="true" />{t}</li>)}</ul>
              </div>
              <div className="lp-card lp-list">
                <h3>Nossos compromissos</h3>
                <ul>{PROMISES.map((t) => <li key={t}><span className="lp-ok"><Icon name="check" size={14} /></span>{t}</li>)}</ul>
              </div>
            </div>
            <p className="lp-links">
              <Link href="/privacidade">Política de privacidade</Link>
              <Link href="/termos">Termos de serviço</Link>
              <Link href="/exclusao-de-dados">Exclusão de dados</Link>
            </p>
          </div>
        </section>

        <section id="empresa" className="lp-sec lp-alt" aria-labelledby="lp-empresa">
          <div className="lp-wrap lp-company">
            <div>
              <p className="lp-eyebrow">Empresa</p>
              <h2 id="lp-empresa" className="lp-h2">Quem opera o {BRAND.name}.</h2>
              <p className="lp-sub">O {BRAND.name} é desenvolvido e operado {legal.name ? `pela ${legal.name}` : "por uma equipe independente"}. Fale com a gente para contratar, tirar dúvidas ou pedir a exclusão de dados.</p>
              {mail && <a href={`mailto:${mail}`} className="lp-btn lp-btn-accent">Fale conosco</a>}
            </div>
            <dl className="lp-facts">
              {legal.name && <div><dt><Icon name="building" size={18} />Razão social</dt><dd>{legal.name}</dd></div>}
              {legal.cnpj && <div><dt><Icon name="doc" size={18} />CNPJ</dt><dd>{legal.cnpj}</dd></div>}
              {legal.address.length > 0 && <div><dt><Icon name="pin" size={18} />Endereço</dt><dd>{legal.address.map((l) => <span key={l}>{l}</span>)}</dd></div>}
              {mail && <div><dt><Icon name="mail" size={18} />E-mail</dt><dd><a href={`mailto:${mail}`}>{mail}</a></dd></div>}
              {legal.phone && <div><dt><Icon name="phone" size={18} />Telefone</dt><dd><a href={`tel:${tel}`}>{legal.phone}</a></dd></div>}
            </dl>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-top">
            <span className="lp-logo"><img src="/logo-icon.webp" alt="" width={24} height={24} /><span>{BRAND.name}</span></span>
            <nav aria-label="Links legais">
              <Link href="/privacidade">Política de privacidade</Link>
              <Link href="/termos">Termos de serviço</Link>
              <Link href="/exclusao-de-dados">Exclusão de dados</Link>
              <Link href="/login">Entrar</Link>
            </nav>
          </div>
          <p>© {year} {[legal.name || BRAND.name, legal.cnpj && `CNPJ ${legal.cnpj}`, legal.address.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</p>
          <p>WhatsApp e Meta são marcas da Meta Platforms, Inc. O {BRAND.name} é um produto independente que usa a API oficial do WhatsApp Business e não é afiliado à Meta.</p>
        </div>
      </footer>
    </div>
  );
}
