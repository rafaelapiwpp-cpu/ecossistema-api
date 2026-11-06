import Legal from "@/components/Legal";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Exclusão de dados · ${BRAND.name}` };

export default function Exclusao() {
  return (
    <Legal title="Exclusão de dados do usuário" updated="20 de outubro de 2026">
      <p>Qualquer empresa ou pessoa cujos dados sejam tratados pelo {BRAND.name} pode pedir a exclusão a qualquer momento.</p>

      <h2>Como solicitar</h2>
      <ol>
        <li>{BRAND.contactEmail ? <>Envie um e-mail para <b>{BRAND.contactEmail}</b> com o assunto "Exclusão de dados".</> : <>Peça a exclusão à empresa que conversa com você pelo WhatsApp ou pelo contato indicado em <a href="/sobre">/sobre</a>.</>}</li>
        <li>Informe o que deve ser excluído: o ID da conta do WhatsApp Business (WABA) ou o número de telefone comercial, no caso de empresas; ou o seu número de telefone, no caso de contatos que receberam mensagens.</li>
        <li>Responderemos confirmando o recebimento e concluiremos a exclusão em até 15 dias.</li>
      </ol>

      <h2>Desconectar a conta da Meta</h2>
      <p>Empresas também podem remover o acesso do {BRAND.name} à sua conta diretamente no Gerenciador de Negócios da Meta: Configurações do negócio → Integrações → Apps conectados → remover o app. Se a conta foi compartilhada conosco como parceira, basta remover o parceiro em Configurações do negócio → Usuários → Parceiros. A partir daí não recebemos mais dados dessa conta.</p>

      <h2>O que é excluído</h2>
      <p>Todos os dados relacionados ao identificador informado: dados da conta, números, modelos de mensagem, conversas e mensagens do atendimento, contatos e funis, eventos de entrega e métricas. Registros necessários para cumprir obrigações legais podem ser mantidos pelo prazo exigido em lei.</p>
    </Legal>
  );
}
