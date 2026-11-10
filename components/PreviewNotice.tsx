"use client";
// Portal em prévia de treinamento (recurso "previa" da empresa): faixa fixa no topo de todas as telas e um aviso
// que abre logo ao entrar (uma vez por sessão do navegador) explicando que é um acesso temporário, só para conhecer.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Nav";

export default function PreviewNotice({ company, slug }: { company: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const key = `previa-vista:${slug}`;

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch { /* sem armazenamento: mostra sempre */ }
    if (!seen) setOpen(true);
  }, [key]);
  useEffect(() => {
    if (!open) return;
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const close = () => {
    try { sessionStorage.setItem(key, "1"); } catch { /* ok */ }
    setOpen(false);
  };

  return (
    <>
      <div className="pv-strip" role="status">
        <Icon name="alert" size={15} className="" />
        <span><b>Prévia de treinamento</b> · acesso temporário. Nem todos os dados estão integrados.</span>
        <button type="button" onClick={() => setOpen(true)}>Saiba mais</button>
      </div>
      {open && (
        <div className="pv-back" onClick={close}>
          <div className="pv-modal" role="dialog" aria-modal="true" aria-labelledby="pv-title" onClick={(e) => e.stopPropagation()}>
            <span className="pv-ico" aria-hidden><Icon name="alert" size={22} className="" /></span>
            <h2 id="pv-title">Acesso temporário de visualização</h2>
            <p>
              Este é um ambiente de teste para você conhecer o portal da <b>{company}</b> e entender como ele vai funcionar.
              Ainda não é a versão final.
            </p>
            <ul>
              <li>Nem todos os dados da API oficial do WhatsApp (Meta) estão integrados à plataforma ainda.</li>
              <li>Informações podem estar faltando e nem todas as mensagens estão sendo exibidas aqui.</li>
              <li>Nesta prévia não é possível enviar nem responder mensagens.</li>
              <li>Os números aparecem como inativos na plataforma até a ativação da conta.</li>
            </ul>
            <button ref={btn} type="button" className="pv-ok" onClick={close}>Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
