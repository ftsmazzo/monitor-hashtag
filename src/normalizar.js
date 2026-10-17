import { config } from "./config.js";

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const base = (s) => semAcento(String(s ?? "").toLowerCase());

const tiposDeBusca = {
  hashtag: config.hashtags.map(base),
  frase: config.frases.map((f) => base(f).replace(/\s+/g, " ").trim()),
};

/** Diz se o texto traz a hashtag, a frase, as duas ou nenhuma. */
export function classificar(texto) {
  const corrido = base(texto);
  const espacado = corrido.replace(/\s+/g, " ");
  const palavras = espacado.split(" ").map((w) => w.replace(/^#+/, "").replace(/[^a-z0-9_]/g, ""));
  const temHashtag = tiposDeBusca.hashtag.some((h) => palavras.includes(h));
  const temFrase = tiposDeBusca.frase.some((f) => espacado.includes(f));
  if (temHashtag && temFrase) return "ambos";
  if (temHashtag) return "hashtag";
  if (temFrase) return "frase";
  return null;
}

const numero = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const dataIso = (v) => {
  const t = v ? new Date(v).getTime() : Number.NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export function normalizarX(item) {
  if (!item?.id || item.isRetweet) return null;
  const texto = item.text ?? item.fullText ?? "";
  const match = classificar(texto);
  if (!match) return null;
  const midias = item.extendedEntities?.media ?? item.entities?.media ?? [];
  return {
    id: `x:${item.id}`,
    rede: "x",
    url: item.url ?? item.twitterUrl,
    autor: item.author?.userName ?? "",
    nome: item.author?.name ?? "",
    seguidores: numero(item.author?.followers),
    texto,
    video: midias.some((m) => m.type === "video" || m.type === "animated_gif"),
    publicado: dataIso(item.createdAt),
    curtidas: numero(item.likeCount),
    comentarios: numero(item.replyCount),
    compartilhamentos: (numero(item.retweetCount) ?? 0) + (numero(item.quoteCount) ?? 0),
    views: numero(item.viewCount),
    match,
  };
}

export function normalizarTikTok(item) {
  if (!item?.id || item.errorCode) return null;
  const texto = item.text ?? "";
  return {
    id: `tiktok:${item.id}`,
    rede: "tiktok",
    url: item.webVideoUrl,
    autor: item.authorMeta?.name ?? "",
    nome: item.authorMeta?.nickName ?? "",
    seguidores: numero(item.authorMeta?.fans),
    texto,
    video: true,
    publicado: dataIso(item.createTimeISO),
    curtidas: numero(item.diggCount),
    comentarios: numero(item.commentCount),
    compartilhamentos: numero(item.shareCount),
    views: numero(item.playCount),
    match: classificar(texto) ?? "hashtag",
  };
}

export function normalizarInstagram(item) {
  if (!item?.id) return null;
  const texto = item.caption ?? "";
  return {
    id: `instagram:${item.id}`,
    rede: "instagram",
    url: item.url,
    autor: item.ownerUsername ?? "",
    nome: item.ownerFullName ?? "",
    seguidores: null,
    texto,
    video: item.type === "Video" || item.productType === "clips",
    publicado: dataIso(item.timestamp),
    curtidas: numero(item.likesCount),
    comentarios: numero(item.commentsCount),
    compartilhamentos: null,
    views: numero(item.videoPlayCount ?? item.videoViewCount),
    match: classificar(texto) ?? "hashtag",
  };
}
