import type { DisparosService } from './service';
import type { ID } from './entities';

/** O que as rotas HTTP precisam. Montado por mock-container (testes) ou next-container (app). */
export interface DisparosContainer {
  service: DisparosService;
  /** Resolve o tenant da requisição. Troque pela sessão do CRM. */
  getTenantId(req: Request): ID;
  /** Um passo do worker: entrega webhooks simulados, dispara, acorda execuções. */
  tick(): Promise<void>;
  /** Só no modo simulação. */
  sim?: {
    /** null = tempo real */
    speed(): number | null;
    setSpeed?(speed: number): void;
    pendingEvents(): Promise<number>;
    simulateInbound(phone: string, text: string, phoneNumberId?: ID): Promise<void>;
  };
  webhook?: { verifyToken: string; appSecret: string | null };
  /** Se definido, POST /worker/tick exige `Authorization: Bearer <segredo>` (cron). */
  workerSecret?: string;
}
