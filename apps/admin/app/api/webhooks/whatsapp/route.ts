import { createHash } from "node:crypto";
import { assinaturaValida, traduzirWebhook } from "@eco/core/contingency";
import type { Prisma } from "@prisma/client";
import { comPlataforma } from "@/lib/db";
import { processarSinal } from "@/lib/contingencia-motor";

/**
 * Webhook da WhatsApp Cloud API (um só endpoint por app da Meta).
 *
 * DESLIGADO até existirem as variáveis no Vercel:
 *   META_WEBHOOK_VERIFY_TOKEN  — o "Verify token" digitado no painel do app da Meta
 *   META_APP_SECRET            — App Secret do app (valida X-Hub-Signature-256)
 * Sem elas responde 503 e não processa nada.
 *
 * Hoje trata a parte de CONTINGÊNCIA (account_update, phone_number_quality_update,
 * message_template_status_update, message_template_quality_update e falhas em `messages`).
 * O módulo Disparos acrescenta aqui as mensagens recebidas (opt-out, respostas)
 * quando entrar no monorepo — é a mesma URL de callback.
 *
 * Fica fora do proxy de sessão: a autenticação é a assinatura HMAC do corpo bruto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CORPO = 1_000_000;

export function GET(req: Request) {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!token) return new Response("webhook desligado", { status: 503 });
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("verificação recusada", { status: 403 });
}

export async function POST(req: Request) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return Response.json({ erro: "webhook desligado: defina META_APP_SECRET" }, { status: 503 });

  const corpo = await req.text();
  if (corpo.length > MAX_CORPO) return Response.json({ erro: "corpo grande demais" }, { status: 413 });
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), segredo)) {
    return Response.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return Response.json({ erro: "JSON inválido" }, { status: 400 });
  }

  // A Meta reenvia o mesmo corpo quando não recebe 200 a tempo: processa uma vez só.
  const id = createHash("sha256").update(corpo).digest("hex");
  const jaVisto = await comPlataforma((tx) => tx.webhookEvento.findUnique({ where: { id }, select: { id: true } }));
  if (jaVisto) return Response.json({ ok: true, repetido: true });

  const { sinais, campos } = traduzirWebhook(payload);
  for (const sinal of sinais) {
    try {
      await processarSinal(sinal, "webhook");
    } catch (err) {
      // Falha num sinal não derruba os outros; devolver 500 faz a Meta reenviar o corpo todo.
      console.error("[webhook] falha ao processar sinal", sinal.tipo, err);
      return Response.json({ erro: "falha ao processar" }, { status: 500 });
    }
  }

  // Corpos com mensagens têm conteúdo de conversa (PII): guarda só o hash para idempotência.
  const temConversa = campos.includes("messages");
  await comPlataforma((tx) => tx.webhookEvento.create({ data: { id, campos, corpo: temConversa ? {} : (payload as Prisma.InputJsonValue) } })).catch(
    () => undefined, // corrida com um reenvio simultâneo: o outro já gravou
  );
  return Response.json({ ok: true, sinais: sinais.length });
}
