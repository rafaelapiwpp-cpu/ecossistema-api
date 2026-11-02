// URL para cadastrar no app da Meta quando WHATSAPP_PROVIDER=meta:
//   https://<domínio>/api/webhooks/whatsapp   (campo assinado: messages)
// No modo simulação responde 403 ao GET de verificação (não há token).
import { createWebhookHandler } from "@/lib/disparos/server/http";
import { getDisparosContainer } from "@/lib/disparos/server/app-container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = createWebhookHandler(getDisparosContainer);
