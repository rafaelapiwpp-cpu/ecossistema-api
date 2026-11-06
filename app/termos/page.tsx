import Legal from "@/components/Legal";
import { BRAND, OPERATOR } from "@/lib/brand";

export const metadata = { title: `Termos de serviço · ${BRAND.name}` };

export default function Termos() {
  return (
    <Legal title="Termos de serviço" updated="20 de outubro de 2026">
      <h2>1. O serviço</h2>
      <p>O {BRAND.name} é uma plataforma para contas da Plataforma WhatsApp Business (API Oficial da Meta) operada por {OPERATOR}. Ela permite enviar mensagens e campanhas com modelos aprovados, atender as conversas numa caixa de atendimento, organizar os contatos em funis de vendas, criar modelos de mensagem e acompanhar envios, métricas e custos das contas conectadas.</p>

      <h2>2. Quem pode usar</h2>
      <p>O acesso é restrito a empresas clientes de {OPERATOR} e à sua equipe. Ao conectar uma conta do WhatsApp Business, a empresa declara ter poderes para autorizar o acesso aos dados dessa conta.</p>

      <h2>3. Regras da Meta</h2>
      <p>O uso do sistema está sujeito aos Termos da Plataforma WhatsApp Business, à Política de Mensagens Comerciais do WhatsApp e à Política de Comércio da Meta. A empresa cliente é responsável pelo conteúdo das mensagens que envia, pela obtenção de consentimento dos seus contatos e pelo pagamento das mensagens cobradas pela Meta.</p>

      <h2>4. Responsabilidades</h2>
      <p>Fazemos o possível para manter o serviço disponível e os dados corretos, mas as métricas e os valores exibidos são os informados pela Meta e podem ser aproximados ou sofrer atraso. Não nos responsabilizamos por decisões da Meta sobre contas, números ou modelos de mensagem.</p>

      <h2>5. Encerramento</h2>
      <p>A empresa cliente pode encerrar o uso a qualquer momento, solicitando a desconexão da conta e a exclusão dos seus dados (ver <a href="/exclusao-de-dados">Exclusão de dados</a>). Podemos suspender o acesso em caso de violação destes termos ou das políticas da Meta.</p>

      <h2>6. Contato</h2>
      <p>{OPERATOR}{BRAND.contactEmail ? ` · ${BRAND.contactEmail}` : ""}</p>
    </Legal>
  );
}
