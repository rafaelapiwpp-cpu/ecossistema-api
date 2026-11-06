import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { getSettings, DEFAULTS } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  senha: "A senha precisa ter pelo menos 8 caracteres.",
  confirmacao: "As duas senhas não conferem.",
  meta: "Para conectar a Meta já agora, informe o token, a chave secreta do app e o ID do portfólio (BM) — ou deixe os três em branco.",
};

export default async function Setup({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sp = await searchParams;
  if (hasDb() && (await getSettings())) redirect("/login");
  return (
    <div className="login">
      <form action="/api/setup" method="post" style={{ width: "min(560px, 100%)" }} autoComplete="off">
        <div className="brand" style={{ padding: 0 }}><span className="brand-dot" aria-hidden />{BRAND.name}</div>
        <h1>Primeira configuração</h1>
        <p className="muted" style={{ margin: 0 }}>Feita uma única vez. Os dados ficam guardados só no banco do sistema e podem ser alterados depois em Configurações.</p>
        {!hasDb() && <div className="err">O banco de dados ainda não está conectado (POSTGRES_URL). Conecte o banco na hospedagem e recarregue esta página.</div>}
        {sp.erro && <div className="err">{ERR[sp.erro] || "Confira os campos."}</div>}

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="field"><span>Seu nome</span><input name="name" placeholder="Administrador" /></label>
          <label className="field"><span>Seu e-mail (login)</span><input type="email" name="email" placeholder="voce@empresa.com" /></label>
        </div>
        <label className="field"><span>Senha (mín. 8 caracteres)</span><input type="password" name="password" minLength={8} required /></label>
        <label className="field"><span>Confirmar senha</span><input type="password" name="password2" minLength={8} required /></label>

        <h2 style={{ margin: "10px 0 0", fontSize: 15 }}>Meta / WhatsApp <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· opcional agora</span></h2>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Ainda sem o app e o token da Meta? Deixe em branco: crie o seu acesso agora e conecte a BM depois em <b>Conexões</b>. Se preencher, informe o token, a chave secreta e o ID do portfólio.</p>
        <label className="field"><span>Token permanente do usuário do sistema</span><textarea name="meta_token" rows={3} placeholder="EAAG…" /></label>
        <label className="field"><span>Chave secreta do app (App Secret)</span><input type="password" name="meta_app_secret" /></label>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="field"><span>ID do portfólio (BM)</span><input name="meta_business_id" defaultValue={DEFAULTS.meta_business_id} /></label>
          <label className="field"><span>ID do app</span><input name="meta_app_id" defaultValue={DEFAULTS.meta_app_id} /></label>
        </div>
        <button className="btn primary" type="submit" style={{ justifyContent: "center" }} disabled={!hasDb()}>Concluir configuração</button>
      </form>
    </div>
  );
}
