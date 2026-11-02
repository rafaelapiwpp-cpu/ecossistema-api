import { createDisparosHandler } from "@/lib/disparos/server/http";
import { getDisparosContainer } from "@/lib/disparos/server/app-container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createDisparosHandler(getDisparosContainer);
export { handler as GET, handler as POST, handler as PUT };
