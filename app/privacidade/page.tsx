import Legal from "@/components/Legal";
import { BRAND, OPERATOR } from "@/lib/brand";

export const metadata = { title: `Política de privacidade · ${BRAND.name}` };

export default function Privacidade() {
  return (
    <Legal title="Política de privacidade" updated="20 de outubro de 2026">
      <p>O {BRAND.name} é um sistema operado por {OPERATOR} ("nós") para que empresas clientes usem as suas contas da Plataforma WhatsApp Business (API Oficial da Meta): envio de mensagens e campanhas, atendimento das conversas, modelos de mensagem (templates), métricas e custos.</p>

      <h2>1. Quais dados tratamos</h2>
      <ul>
        <li><b>Dados das contas conectadas</b>: identificadores e nomes de contas do WhatsApp Business (WABA), números de telefone comerciais, nome exibido, qualidade e limites de envio.</li>
        <li><b>Modelos de mensagem</b>: nome, categoria, idioma, status de aprovação e qualidade.</li>
        <li><b>Conversas do atendimento</b>: as mensagens enviadas e recebidas pelas contas conectadas (textos, arquivos e mídias), o nome e o número de telefone dos contatos, as notas internas da equipe, o histórico de cada atendimento e as informações do funil de vendas (etapa, valor e observações de cada contato).</li>
        <li><b>Eventos de entrega</b>: para cada mensagem enviada pela conta, o identificador da mensagem, o status (enviada, entregue, lida ou falhou), o código de erro, a categoria de cobrança e o número de telefone do destinatário.</li>
        <li><b>Métricas agregadas</b>: volumes diários de mensagens, leituras, cliques e valores aproximados cobrados pela Meta.</li>
        <li><b>Dados de acesso</b>: credenciais da equipe e registros técnicos de uso do sistema.</li>
      </ul>

      <h2>2. De onde vêm os dados</h2>
      <p>Os dados são obtidos por meio das APIs oficiais da Meta (Graph API e Webhooks da Plataforma WhatsApp Business), mediante autorização concedida pela empresa cliente ao conectar ou compartilhar conosco a sua conta, e do que a própria equipe da empresa cliente cadastra no sistema, como contatos e notas.</p>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Enviar as mensagens, campanhas e respostas automáticas configuradas pela empresa cliente.</li>
        <li>Mostrar à equipe da empresa cliente as conversas na caixa de atendimento, para que ela responda aos seus contatos.</li>
        <li>Exibir à empresa cliente e à nossa equipe o desempenho e os custos dos envios.</li>
        <li>Identificar falhas de entrega e problemas de qualidade das contas e dos modelos.</li>
        <li>Cumprir obrigações legais e as políticas da Meta.</li>
      </ul>
      <p>Não usamos esses dados para anúncios.</p>

      <h2>4. Compartilhamento</h2>
      <p>Não vendemos nem cedemos dados a terceiros. Os dados são compartilhados apenas com: a Meta Platforms, como operadora da Plataforma WhatsApp Business; os provedores de hospedagem e banco de dados que sustentam o sistema; e a própria empresa cliente titular da conta.</p>

      <h2>5. Armazenamento e segurança</h2>
      <p>Os dados ficam em banco de dados hospedado em provedor de nuvem, com acesso restrito por senha, transmissão criptografada (HTTPS) e validação de assinatura das notificações da Meta. Eventos de entrega são mantidos por até 12 meses; métricas agregadas, por até 24 meses. As conversas do atendimento ficam guardadas enquanto a empresa cliente usar o serviço ou até que ela peça a exclusão.</p>

      <h2>6. Seus direitos (LGPD)</h2>
      <p>Titulares de dados podem solicitar confirmação de tratamento, acesso, correção, anonimização ou exclusão dos seus dados. Veja como em <a href="/exclusao-de-dados">Exclusão de dados</a> ou escreva para {BRAND.contactEmail}.</p>

      <h2>7. Alterações</h2>
      <p>Esta política pode ser atualizada; a data da última revisão aparece no topo da página.</p>

      <h2>8. Contato</h2>
      <p>{OPERATOR}{BRAND.contactEmail ? ` · ${BRAND.contactEmail}` : ""}</p>
    </Legal>
  );
}
