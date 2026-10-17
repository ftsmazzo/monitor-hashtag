const HORA = 3600_000;
const BRASILIA = 3 * HORA;

const engajamento = (p) => (p.curtidas ?? 0) + (p.comentarios ?? 0) + (p.compartilhamentos ?? 0);
const somar = (lista, f) => lista.reduce((t, p) => t + f(p), 0);

function totais(posts) {
  const autores = new Set(posts.map((p) => `${p.rede}:${p.autor.toLowerCase()}`));
  return {
    posts: posts.length,
    autores: autores.size,
    videos: posts.filter((p) => p.video).length,
    views: somar(posts, (p) => p.views ?? 0),
    engajamento: somar(posts, engajamento),
  };
}

/** Aplica os filtros escolhidos no painel. */
export function filtrar(posts, { rede, video, match, busca }) {
  const termo = busca?.toLowerCase();
  return posts.filter(
    (p) =>
      (!rede || p.rede === rede) &&
      (video !== "sim" || p.video) &&
      (video !== "nao" || !p.video) &&
      (!match || p.match === match || (match === "frase" && p.match === "ambos")) &&
      (!termo || `${p.autor} ${p.nome} ${p.texto}`.toLowerCase().includes(termo)),
  );
}

/** Contagem de posts por hora, em horário de Brasília, da primeira hora até agora. */
function linhaDoTempo(posts, agora) {
  if (posts.length === 0) return [];
  const chave = (t) => new Date(t - BRASILIA).toISOString().slice(0, 13);
  const primeiro = Math.min(...posts.map((p) => new Date(p.publicado).getTime()));
  const horas = new Map();
  for (let t = Math.floor(primeiro / HORA) * HORA; t <= agora; t += HORA) {
    horas.set(chave(t), { hora: chave(t), total: 0, x: 0, tiktok: 0, instagram: 0 });
  }
  for (const p of posts) {
    const h = horas.get(chave(new Date(p.publicado).getTime()));
    if (h) {
      h.total += 1;
      h[p.rede] += 1;
    }
  }
  return [...horas.values()];
}

function topAutores(posts, limite = 10) {
  const mapa = new Map();
  for (const p of posts) {
    const k = `${p.rede}:${p.autor.toLowerCase()}`;
    const a = mapa.get(k) ?? { rede: p.rede, autor: p.autor, seguidores: p.seguidores, posts: 0, engajamento: 0, views: 0 };
    a.posts += 1;
    a.engajamento += engajamento(p);
    a.views += p.views ?? 0;
    mapa.set(k, a);
  }
  return [...mapa.values()].sort((a, b) => b.engajamento - a.engajamento || b.posts - a.posts).slice(0, limite);
}

export function resumo(todos, filtros, rodadas, agora = Date.now()) {
  const posts = filtrar(todos, filtros);
  const naHora = (de, ate) => posts.filter((p) => {
    const t = new Date(p.publicado).getTime();
    return t > de && t <= ate;
  }).length;

  const porRede = {};
  for (const rede of ["x", "tiktok", "instagram"]) {
    porRede[rede] = totais(posts.filter((p) => p.rede === rede));
  }

  const cobertura = {};
  for (const rede of ["x", "tiktok", "instagram"]) {
    const ultimas = rodadas.filter((r) => r.rede === rede);
    const ultima = ultimas.at(-1) ?? null;
    const ultimaBoa = ultimas.findLast((r) => r.status === "ok") ?? null;
    cobertura[rede] = { ultima, ultimaBoa, rodadas: ultimas.length };
  }

  return {
    geradoEm: new Date(agora).toISOString(),
    totais: totais(posts),
    porRede,
    ultimaHora: naHora(agora - HORA, agora),
    horaAnterior: naHora(agora - 2 * HORA, agora - HORA),
    linha: linhaDoTempo(posts, agora),
    top: [...posts].sort((a, b) => engajamento(b) - engajamento(a)).slice(0, 10),
    autores: topAutores(posts),
    posts: [...posts].sort((a, b) => b.publicado.localeCompare(a.publicado)).slice(0, 300),
    cobertura,
  };
}

const aspas = (v) => `"${String(v ?? "").replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;

export function paraCsv(posts) {
  const colunas = ["rede", "autor", "nome", "seguidores", "publicado", "video", "match", "curtidas", "comentarios", "compartilhamentos", "views", "url", "texto"];
  const linhas = posts.map((p) => colunas.map((c) => aspas(p[c])).join(","));
  return `﻿${colunas.join(",")}\n${linhas.join("\n")}`;
}
