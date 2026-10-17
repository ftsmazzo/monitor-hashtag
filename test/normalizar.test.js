import { test } from "node:test";
import assert from "node:assert/strict";
import { classificar, normalizarTikTok, normalizarX } from "../src/normalizar.js";
import { filtrar, resumo } from "../src/stats.js";

test("reconhece a hashtag, inclusive com erro de digitação e maiúsculas", () => {
  assert.equal(classificar("Bora! #LulaQuebrouOBrasil"), "hashtag");
  assert.equal(classificar("#lulauqebrouobrasil"), "hashtag");
});

test("reconhece a frase sem hashtag, com ou sem acento e caixa", () => {
  assert.equal(classificar("LULA QUEBROU O BRASIL"), "frase");
  assert.equal(classificar("lula  quebrou o  brasil mesmo"), "frase");
});

test("reconhece quando há os dois e ignora texto sem relação", () => {
  assert.equal(classificar("Lula quebrou o Brasil #LulaQuebrouOBrasil"), "ambos");
  assert.equal(classificar("bom dia"), null);
});

test("X: descarta retweet e texto sem o termo", () => {
  assert.equal(normalizarX({ id: "1", isRetweet: true, text: "#LulaQuebrouOBrasil" }), null);
  assert.equal(normalizarX({ id: "2", text: "outra coisa" }), null);
});

test("X: converte campos e detecta vídeo", () => {
  const p = normalizarX({
    id: "3",
    url: "https://x.com/a/status/3",
    text: "Lula quebrou o Brasil",
    createdAt: "Fri Oct 16 15:00:00 +0000 2026",
    author: { userName: "fulano", followers: 10 },
    likeCount: 5,
    retweetCount: 2,
    quoteCount: 1,
    extendedEntities: { media: [{ type: "video" }] },
  });
  assert.equal(p.id, "x:3");
  assert.equal(p.video, true);
  assert.equal(p.match, "frase");
  assert.equal(p.compartilhamentos, 3);
  assert.equal(p.publicado, "2026-10-16T15:00:00.000Z");
});

test("TikTok: ignora item de erro e assume hashtag quando a legenda não traz", () => {
  assert.equal(normalizarTikTok({ id: "9", errorCode: "x" }), null);
  const p = normalizarTikTok({ id: "10", text: "oi", createTimeISO: "2026-10-16T12:00:00.000Z", authorMeta: { name: "z" } });
  assert.equal(p.match, "hashtag");
  assert.equal(p.video, true);
});

const post = (id, rede, autor, extra = {}) => ({
  id, rede, autor, texto: "t", nome: "", video: false, match: "hashtag",
  publicado: "2026-10-16T15:00:00.000Z", curtidas: 1, comentarios: 0, compartilhamentos: 0, views: 10, ...extra,
});

test("resumo conta pessoas únicas por rede e respeita filtros", () => {
  const posts = [post("a", "x", "Ana"), post("b", "x", "ana"), post("c", "tiktok", "ana", { video: true })];
  const r = resumo(posts, {}, [], Date.parse("2026-10-16T16:00:00Z"));
  assert.equal(r.totais.posts, 3);
  assert.equal(r.totais.autores, 2);
  assert.equal(r.totais.videos, 1);
  assert.equal(filtrar(posts, { rede: "x" }).length, 2);
  assert.equal(filtrar(posts, { video: "sim" }).length, 1);
});
