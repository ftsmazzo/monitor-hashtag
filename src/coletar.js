import { config } from "./config.js";
import { normalizarInstagram, normalizarTikTok, normalizarX } from "./normalizar.js";

const APIFY = "https://api.apify.com/v2";

async function rodarAtor(ator, entrada) {
  const url = `${APIFY}/acts/${ator}/run-sync-get-dataset-items?timeout=270&clean=true`;
  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apifyToken}`,
    },
    body: JSON.stringify(entrada),
    signal: AbortSignal.timeout(290_000),
  });
  if (!resposta.ok) {
    throw new Error(`Apify ${ator}: HTTP ${resposta.status}`);
  }
  return resposta.json();
}

/** Dia de início no formato que o X espera, em horário de Brasília. */
const diaInicio = () => new Date(config.inicio.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

const fontes = {
  x: async () => {
    const termos = [
      ...config.hashtags.map((h) => `#${h}`),
      ...config.frases.map((f) => `"${f}"`),
    ];
    const itens = await rodarAtor("apidojo~tweet-scraper", {
      searchTerms: termos,
      sort: "Latest",
      maxItems: config.maxItens,
      start: diaInicio(),
    });
    return itens.map(normalizarX);
  },
  tiktok: async () => {
    const itens = await rodarAtor("clockworks~tiktok-hashtag-scraper", {
      hashtags: config.hashtags,
      resultsPerPage: config.maxItens,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    });
    return itens.map(normalizarTikTok);
  },
  instagram: async () => {
    const itens = [];
    for (const resultsType of ["posts", "reels"]) {
      const parte = await rodarAtor("apify~instagram-hashtag-scraper", {
        hashtags: config.hashtags,
        resultsType,
        resultsLimit: Math.ceil(config.maxItens / 2),
      });
      itens.push(...parte);
    }
    return itens.map(normalizarInstagram);
  },
};

let rodando = false;
export const estaRodando = () => rodando;

const diaBrasilia = (d) => new Date(new Date(d).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/** Faz uma rodada de coleta em todas as redes ligadas, respeitando o teto diário. */
export async function rodarColeta(loja, redes = config.redes) {
  if (rodando) return { ignorada: true };
  if (!config.apifyToken) throw new Error("APIFY_TOKEN não configurado");
  rodando = true;
  const resultados = [];
  try {
    const anteriores = await loja.listarRodadas();
    for (const rede of redes) {
      const fonte = fontes[rede];
      if (!fonte) continue;
      const agora = new Date();
      const hoje = anteriores.filter((r) => r.rede === rede && diaBrasilia(r.em) === diaBrasilia(agora)).length;
      const rodada = { rede, em: agora.toISOString(), status: "ok", lidos: 0, validos: 0, novos: 0 };
      if (hoje >= config.maxRodadasDia) {
        rodada.status = "limite";
        rodada.erro = `Teto de ${config.maxRodadasDia} rodadas por dia atingido`;
      } else {
        try {
          const bruto = await fonte();
          rodada.lidos = bruto.length;
          const inicio = config.inicio.getTime();
          const validos = bruto
            .filter((p) => p?.publicado && new Date(p.publicado).getTime() >= inicio)
            .map((p) => ({ ...p, coletado_em: rodada.em }));
          rodada.validos = validos.length;
          rodada.novos = await loja.gravarPosts(validos);
        } catch (erro) {
          rodada.status = "erro";
          rodada.erro = erro instanceof Error ? erro.message : String(erro);
        }
      }
      await loja.gravarRodada(rodada);
      resultados.push(rodada);
    }
    return { ignorada: false, resultados };
  } finally {
    rodando = false;
  }
}
