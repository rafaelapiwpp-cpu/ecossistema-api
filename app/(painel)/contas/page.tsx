import { redirect } from "next/navigation";

// "Contas e números" agora faz parte de Conexões (cada BM com as suas contas e números)
export default function Contas() {
  redirect("/conexoes");
}
