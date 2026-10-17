import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { abrirLoja } from "./store.js";
import { estaRodando, rodarColeta } from "./coletar.js";
import { filtrar, paraCsv, resumo } from "./stats.js";

if (config.producao && !config.senha) {
  console.error("PAINEL_SENHA é obrigatória em produção.");
  process.exit(1);
}

const loja = await abrirLoja();
const pagina = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const igual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function autorizado(req) {
  if (!config.senha) return true;
  const [tipo, valor] = (req.headers.authorization ?? "").split(" ");
  if (tipo !== "Basic" || !valor) return false;
  const [usuario, ...resto] = Buffer.from(valor, "base64").toString().split(":");
  return igual(usuario, config.usuario) && igual(resto.join(":"), config.senha);
}

const enviar = (res, status, corpo, tipo = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(status, { "content-type": tipo, "cache-control": "no-store", ...extra });
  res.end(typeof corpo === "string" ? corpo : JSON.stringify(corpo));
};

let proximaColeta = null;

async function coletarEmSegundoPlano() {
  try {
    await rodarColeta(loja);
  } catch (erro) {
    console.error("Coleta falhou:", erro instanceof Error ? erro.message : erro);
  }
  if (config.intervaloMin > 0) proximaColeta = Date.now() + config.intervaloMin * 60_000;
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/health") return enviar(res, 200, { status: "ok" });

    if (!autorizado(req)) {
      return enviar(res, 401, "Acesso restrito", "text/plain; charset=utf-8", {
        "www-authenticate": 'Basic realm="Monitor"',
      });
    }

    if (url.pathname === "/") return enviar(res, 200, pagina, "text/html; charset=utf-8");

    const filtros = {
      rede: url.searchParams.get("rede") || undefined,
      video: url.searchParams.get("video") || undefined,
      match: url.searchParams.get("match") || undefined,
      busca: url.searchParams.get("busca") || undefined,
    };

    if (url.pathname === "/api/resumo") {
      const [posts, rodadas] = await Promise.all([loja.listarPosts(), loja.listarRodadas()]);
      return enviar(res, 200, {
        ...resumo(posts, filtros, rodadas),
        estado: {
          rodando: estaRodando(),
          proximaColeta,
          inicio: config.inicio.toISOString(),
          termos: { hashtags: config.hashtags, frases: config.frases },
          temToken: Boolean(config.apifyToken),
        },
      });
    }

    if (url.pathname === "/api/posts.csv") {
      const posts = filtrar(await loja.listarPosts(), filtros);
      posts.sort((a, b) => b.publicado.localeCompare(a.publicado));
      return enviar(res, 200, paraCsv(posts), "text/csv; charset=utf-8", {
        "content-disposition": 'attachment; filename="posts.csv"',
      });
    }

    if (url.pathname === "/api/coletar" && req.method === "POST") {
      if (estaRodando()) return enviar(res, 409, { erro: "Já existe uma coleta em andamento" });
      if (!config.apifyToken) return enviar(res, 400, { erro: "APIFY_TOKEN não configurado" });
      void coletarEmSegundoPlano();
      return enviar(res, 202, { ok: true });
    }

    return enviar(res, 404, { erro: "Não encontrado" });
  } catch (erro) {
    console.error(erro);
    return enviar(res, 500, { erro: "Erro interno" });
  }
});

servidor.listen(config.porta, () => {
  console.log(`Monitor no ar na porta ${config.porta}`);
  if (config.intervaloMin > 0 && config.apifyToken) {
    void coletarEmSegundoPlano();
    setInterval(() => void coletarEmSegundoPlano(), config.intervaloMin * 60_000).unref();
  }
});
