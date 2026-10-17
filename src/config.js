const lista = (valor, padrao) =>
  (valor ?? padrao)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const inteiro = (valor, padrao) => {
  const n = Number.parseInt(valor ?? "", 10);
  return Number.isFinite(n) ? n : padrao;
};

export const config = {
  porta: inteiro(process.env.PORT, 3000),
  apifyToken: process.env.APIFY_TOKEN ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  usuario: process.env.PAINEL_USUARIO ?? "campanha",
  senha: process.env.PAINEL_SENHA ?? "",
  acessoLivre: process.env.ACESSO_LIVRE === "1",
  producao: process.env.NODE_ENV === "production",
  inicio: new Date(process.env.INICIO ?? "2026-10-16T00:00:00-03:00"),
  hashtags: lista(process.env.HASHTAGS, "lulaquebrouobrasil,lulauqebrouobrasil").map((h) =>
    h.replace(/^#/, "").toLowerCase(),
  ),
  frases: lista(process.env.FRASES, "Lula quebrou o Brasil"),
  redes: lista(process.env.REDES, "x,tiktok,instagram"),
  intervaloMin: inteiro(process.env.INTERVALO_MIN, 60),
  maxItens: inteiro(process.env.MAX_ITENS, 300),
  maxRodadasDia: inteiro(process.env.MAX_RODADAS_DIA, 30),
};
