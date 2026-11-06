/** Troca de tela no portal: resposta imediata ao clique enquanto a página chega. */
export default function PortalLoading() {
  return (
    <div className="portal-loading" aria-busy="true" aria-label="Carregando">
      <div className="pl-bar" />
      <div className="pl-row"><span /><span /><span /><span /></div>
      <div className="pl-block" />
    </div>
  );
}
