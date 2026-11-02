/**
 * Aplica prisma/sql/*.sql (em ordem alfabética) depois do `prisma db push`.
 * Roda no build da Vercel: `prisma generate && prisma db push && node scripts/aplicar-sql.cjs && next build`.
 *
 * - Tudo numa única transação: ou aplica todos os arquivos, ou nenhum (e o build falha,
 *   mantendo no ar o deploy anterior).
 * - Usa a conexão direta (DATABASE_URL_UNPOOLED) quando existir: DDL não passa bem pelo pooler.
 * - Declara o escopo de plataforma, senão o próprio RLS esconderia as linhas dos UPDATEs.
 * - Os arquivos precisam ser idempotentes (rodam em todo deploy).
 */
const fs = require("node:fs");
const path = require("node:path");

/** Divide um script em comandos, respeitando strings ('...'), identificadores ("...") e blocos $tag$...$tag$. */
function dividirSql(texto) {
  const comandos = [];
  let atual = "";
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "-" && texto[i + 1] === "-") {
      const fim = texto.indexOf("\n", i);
      const ate = fim === -1 ? texto.length : fim;
      atual += texto.slice(i, ate);
      i = ate;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < texto.length) {
        if (texto[j] === c && texto[j + 1] === c) { j += 2; continue; }
        if (texto[j] === c) break;
        j++;
      }
      atual += texto.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(texto.slice(i));
      if (m) {
        const tag = m[0];
        const fim = texto.indexOf(tag, i + tag.length);
        if (fim === -1) throw new Error(`Bloco ${tag} sem fechamento`);
        atual += texto.slice(i, fim + tag.length);
        i = fim + tag.length;
        continue;
      }
    }
    if (c === ";") {
      if (atual.replace(/--[^\n]*/g, "").trim()) comandos.push(atual.trim());
      atual = "";
      i++;
      continue;
    }
    atual += c;
    i++;
  }
  if (atual.replace(/--[^\n]*/g, "").trim()) comandos.push(atual.trim());
  return comandos;
}

function lerArquivos(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ nome: f, comandos: dividirSql(fs.readFileSync(path.join(dir, f), "utf8")) }));
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("[aplicar-sql] Sem DATABASE_URL: pulando (build sem banco).");
    return;
  }
  const arquivos = lerArquivos(path.join(__dirname, "..", "prisma", "sql"));
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SELECT set_config('app.scope', 'platform', true)");
        for (const arq of arquivos) {
          for (const cmd of arq.comandos) await tx.$executeRawUnsafe(cmd);
          console.log(`[aplicar-sql] ${arq.nome}: ${arq.comandos.length} comandos`);
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[aplicar-sql] FALHOU:", err);
    process.exit(1);
  });
}

module.exports = { dividirSql, lerArquivos };
