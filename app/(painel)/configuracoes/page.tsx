import SyncButton from "@/components/SyncButton";
import WebhookDiag from "@/components/WebhookDiag";
import Companies from "@/components/Companies";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { DEFAULTS } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import { requirePage } from "@/lib/guard";
import { isMaster } from "@/lib/roles";
import { mailConfig, mailFromEnv } from "@/lib/mail";
import { recoveryAddress } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

const WEBHOOK_FIELDS = [
  ["messages", "status de cada mensagem (enviada, entregue, lida, falhou) e categoria de cobrança"],
  ["message_template_status_update", "aprovação, rejeição e pausa de templates"],
  ["message_template_quality_update", "qualidade dos templates"],
  ["template_category_update", "mudança de categoria (e de preço) de um template"],
  ["phone_number_quality_update", "qualidade e limite de envio dos números"],
  ["account_update", "restrições e revisão da conta"],
];

const mask = (v: string | null | undefined) => (v ? `••••••••${v.slice(-4)}` : "—");

const MAIL_ERR: Record<string, string> = {
  mail_env: "O e-mail está definido pelas variáveis HUB_MAIL_* na Vercel; para editar aqui, remova-as lá.",
  mail_from: "Informe um e-mail de remetente válido.",
  mail_off: "Preencha o remetente e a senha de app antes de testar.",
  mail_to: "Informe um e-mail de destino para o teste (ou cadastre o seu e-mail de recuperação em Equipe).",
  mail_send: "O envio falhou",
};

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ ok?: string; novo?: string; erro?: string; mail_ok?: string; detalhe?: string }> }) {
  const sp = await searchParams;
  const sess = await requirePage({ admin: true });
  const s = sess?.s ?? null;
  const master = !sess || isMaster(sess.user.role); // modo demonstração mostra tudo
  const base = await siteUrl();
  const mail = mailConfig(s), mailEnv = mailFromEnv();
  const myRecovery = sess ? recoveryAddress(sess.user) : null;

  return (
    <>
      <div className="topbar">
        <div className="title">
          <h1>Configurações</h1>
          <p>Empresas (portal de clientes), webhook, atendimento e app da Meta</p>
        </div>
        <div className="controls"><SyncButton demo={!hasDb()} /></div>
      </div>

      {sp.novo && (
        <div className="banner">
          <b>Sistema configurado.</b> A sua BM já está em Conexões. Rode a primeira sincronização pelo botão acima e configure o webhook no app da Meta com os dados abaixo.
        </div>
      )}
      {sp.ok && <div className="banner"><span className="ok">Alterações salvas.</span></div>}
      {sp.erro === "senha" && <div className="banner"><span className="err">A nova senha precisa ter pelo menos 8 caracteres.</span></div>}
      {sp.erro === "master" && <div className="banner"><span className="err">Só o Master altera o app da Meta e o e-mail do sistema.</span></div>}
      {sp.erro && MAIL_ERR[sp.erro] && <div className="banner"><span className="err">{MAIL_ERR[sp.erro]}{sp.detalhe ? `: ${sp.detalhe}` : "."}</span></div>}
      {sp.mail_ok && <div className="banner"><span className="ok">E-mail de teste enviado para {sp.mail_ok}. Confira a caixa de entrada (e o spam).</span></div>}
      {!hasDb() && <div className="banner"><b>Modo demonstração.</b> Sem banco de dados conectado, nada pode ser salvo aqui.</div>}

      {/* portal de clientes: empresas, números, usuários-cliente e funis */}
      {hasDb() && <div id="empresas" style={{ marginBottom: 16 }}><Companies /></div>}

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Webhook da Meta</h2>
          <p className="sub">Cole no app da Meta: WhatsApp → Configuração → Webhook → Editar</p>
          <div className="field" style={{ marginBottom: 10 }}><span>URL de callback</span><div className="code">{base}/api/webhook</div></div>
          <div className="field" style={{ marginBottom: 14 }}><span>Token de verificação</span><div className="code">{s?.webhook_verify_token || "(gerado na primeira configuração)"}</div></div>
          <p className="sub" style={{ marginBottom: 6 }}>Depois clique em "Gerenciar" nos campos do webhook e assine:</p>
          <ul className="steps">
            {WEBHOOK_FIELDS.map(([f, d]) => <li key={f}><b className="num">{f}</b> <span className="muted">— {d}</span></li>)}
          </ul>
          <p className="sub" style={{ marginTop: 14 }}>Ou use "Configurar o webhook automaticamente" no diagnóstico abaixo, que grava isso no app pela API. A inscrição de cada conta (WABA) no app é feita automaticamente a cada sincronização.</p>

          <h2 style={{ marginTop: 22 }}>Páginas públicas para o cadastro do app</h2>
          <p className="sub">Use estes endereços em Configurações do app → Básico</p>
          <div className="field" style={{ marginBottom: 8 }}><span>Política de privacidade</span><div className="code">{base}/privacidade</div></div>
          <div className="field" style={{ marginBottom: 8 }}><span>Termos de serviço</span><div className="code">{base}/termos</div></div>
          <div className="field"><span>Exclusão de dados do usuário</span><div className="code">{base}/exclusao-de-dados</div></div>
        </div>

        <div className="grid" style={{ gap: 16, alignItems: "start" }}>
          <form className="card" action="/api/config" method="post" autoComplete="off">
            <input type="hidden" name="section" value="atendimento" />
            <h2>Atendimento</h2>
            <p className="sub">Vale para todas as contas que a equipe atende.</p>
            <div className="grid" style={{ gap: 12 }}>
              <label className="field"><span>Palavras de descadastro (opt-out), separadas por vírgula</span><input name="optout_keywords" defaultValue={s?.optout_keywords || "SAIR,PARAR,CANCELAR,STOP"} /></label>
              <label className="field"><span>Palavras para voltar a receber (opt-in)</span><input name="optin_keywords" defaultValue={s?.optin_keywords || "VOLTAR"} /></label>
              <label className="field"><span>Resposta automática ao descadastro (vazio = não responder)</span><textarea name="optout_reply" rows={2} defaultValue={s?.optout_reply || ""} /></label>
              <label className="field"><span>Encerrar conversas sem resposta após (dias; 0 = nunca)</span><input type="number" name="autoclose_days" min={0} max={90} defaultValue={s?.autoclose_days ?? 3} /></label>
              <div><button className="btn primary" type="submit" disabled={!hasDb()}>Salvar atendimento</button></div>
            </div>
          </form>

          {master ? (
            <form className="card" action="/api/config" method="post" autoComplete="off">
              <input type="hidden" name="section" value="app" />
              <h2>App principal da Meta <span className="badge-master">Master</span></h2>
              <p className="sub">O app que recebe o webhook. Os tokens de cada BM ficam em <a href="/conexoes">Conexões</a>.</p>
              <div className="grid" style={{ gap: 12 }}>
                <label className="field"><span>ID do app</span><input name="meta_app_id" defaultValue={s?.meta_app_id || DEFAULTS.meta_app_id} /></label>
                <label className="field"><span>Chave secreta do app <span className="muted">(atual: {mask(s?.meta_app_secret)})</span></span><input type="password" name="meta_app_secret" placeholder="Nova chave (opcional)" autoComplete="new-password" /></label>
                <label className="check">
                  <input type="checkbox" name="insights_enabled" defaultChecked={Boolean(s?.insights_enabled)} />
                  <span><b>Ativar insights de templates</b> nas contas (leituras, cliques e custo por template). <span className="muted">A Meta não permite desativar depois.</span></span>
                </label>
                <div><button className="btn primary" type="submit" disabled={!hasDb()}>Salvar app</button></div>
              </div>
            </form>
          ) : (
            <div className="card">
              <h2>Conexões com a Meta</h2>
              <p className="sub">Os tokens das BMs e o app principal são gerenciados pelo Master. Veja as conexões da equipe em <a href="/conexoes">Conexões</a>.</p>
            </div>
          )}

          {master && (
            <div className="card" id="email">
              <h2>E-mail do sistema <span className="badge-master">Master</span></h2>
              <p className="sub">Usado em <b>Esqueci minha senha</b>: o código de redefinição vai para o e-mail de recuperação de cada usuário (cadastrado em <a href="/equipe">Equipe</a>{myRecovery ? <> — o seu é <b>{myRecovery}</b></> : null}). Pronto para o Gmail: basta o seu e-mail e uma <b>senha de app</b> do Google.</p>
              {mailEnv ? (
                <div className="banner" style={{ marginBottom: 0 }}>
                  <b>Definido pelas variáveis da Vercel</b> (HUB_MAIL_FROM / HUB_MAIL_PASS{mail?.host && mail.host !== "smtp.gmail.com" ? ` · ${mail.host}:${mail.port}` : ""}). Remetente: <b>{mail?.from}</b>. Para gerenciar aqui, remova essas variáveis no projeto da Vercel.
                </div>
              ) : (
                <form action="/api/config" method="post" autoComplete="off" className="grid" style={{ gap: 12 }}>
                  <input type="hidden" name="section" value="mail" />
                  <label className="field"><span>E-mail remetente (conta do Gmail)</span><input type="email" name="mail_from" defaultValue={s?.mail_from || ""} placeholder="voce@gmail.com" /></label>
                  <label className="field"><span>Senha de app do Google <span className="muted">(atual: {mask(s?.mail_pass)})</span></span><input type="password" name="mail_pass" placeholder={s?.mail_pass ? "Nova senha de app (opcional)" : "16 letras, geradas em myaccount.google.com/apppasswords"} autoComplete="new-password" /></label>
                  <details className="muted" style={{ fontSize: 13 }}>
                    <summary style={{ cursor: "pointer" }}>Outro provedor (SMTP)</summary>
                    <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 10 }}>
                      <label className="field"><span>Servidor SMTP</span><input name="mail_host" defaultValue={s?.mail_host || ""} placeholder="smtp.gmail.com" /></label>
                      <label className="field"><span>Porta</span><input type="number" name="mail_port" defaultValue={s?.mail_port || ""} placeholder="465" min={1} max={65535} /></label>
                      <label className="field" style={{ gridColumn: "span 2" }}><span>Usuário (se for diferente do remetente)</span><input name="mail_user" defaultValue={s?.mail_user || ""} /></label>
                      {s?.mail_pass && <label className="check" style={{ gridColumn: "span 2" }}><input type="checkbox" name="mail_clear" /><span>Apagar a senha salva (desliga o envio de e-mail)</span></label>}
                    </div>
                  </details>
                  <div><button className="btn primary" type="submit" disabled={!hasDb()}>Salvar e-mail</button></div>
                </form>
              )}
              <form action="/api/config" method="post" autoComplete="off" className="grid" style={{ gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <input type="hidden" name="section" value="mail_test" />
                <label className="field"><span>Enviar um e-mail de teste para</span><input type="email" name="to" defaultValue={myRecovery || ""} placeholder="voce@gmail.com" /></label>
                <div><button className="btn" type="submit" disabled={!hasDb() || !mail}>{mail ? "Enviar teste" : "Salve o e-mail para testar"}</button></div>
              </form>
            </div>
          )}

        </div>
      </div>

      <div className="card section" id="webhook">
        <h2>Diagnóstico do webhook</h2>
        <p className="sub">Confere na Meta se o app está apontando para este sistema, se cada conta está inscrita e o que já chegou por aqui. Quando algo estiver faltando, o botão correspondente resolve na hora.</p>
        <WebhookDiag demo={!hasDb()} master={master} />
      </div>

      <div className="card section">
        <h2>Histórico completo</h2>
        <p className="sub">A sincronização diária busca os últimos 7 dias. Use este botão na primeira vez para trazer até 1 ano de mensagens e custos (templates: 90 dias). Pode levar alguns minutos.</p>
        <SyncButton demo={!hasDb()} days={365} label="Carregar último ano" primary={false} />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>{BRAND.name}{master && BRAND.legal.name ? ` · ${BRAND.legal.name}` : ""}</p>
    </>
  );
}
