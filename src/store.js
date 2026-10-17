import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "./config.js";

/** Guarda em arquivo JSON. Serve para teste local; em produção use o Postgres. */
function lojaArquivo(caminho = "data/posts.json") {
  const posts = new Map();
  let rodadas = [];

  const salvar = async () => {
    await mkdir("data", { recursive: true });
    await writeFile(caminho, JSON.stringify({ posts: [...posts.values()], rodadas }));
  };

  return {
    async iniciar() {
      try {
        const lido = JSON.parse(await readFile(caminho, "utf8"));
        for (const p of lido.posts ?? []) posts.set(p.id, p);
        rodadas = lido.rodadas ?? [];
      } catch {
        /* primeiro uso */
      }
    },
    async gravarPosts(novos) {
      let criados = 0;
      for (const p of novos) {
        const antigo = posts.get(p.id);
        if (!antigo) criados += 1;
        posts.set(p.id, { ...p, primeira_vez: antigo?.primeira_vez ?? p.coletado_em });
      }
      await salvar();
      return criados;
    },
    async listarPosts() {
      return [...posts.values()];
    },
    async gravarRodada(r) {
      rodadas.push(r);
      rodadas = rodadas.slice(-500);
      await salvar();
    },
    async listarRodadas() {
      return rodadas;
    },
  };
}

/** Guarda no Postgres. Cada post é um documento jsonb; o filtro fica no código. */
async function lojaPostgres(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 4 });

  return {
    async iniciar() {
      await pool.query(`
        create table if not exists posts (
          id text primary key,
          dados jsonb not null
        );
        create table if not exists rodadas (
          id bigserial primary key,
          dados jsonb not null
        );
      `);
    },
    async gravarPosts(novos) {
      let criados = 0;
      for (const p of novos) {
        const { rows } = await pool.query(
          `insert into posts (id, dados) values ($1, $2::jsonb)
           on conflict (id) do update
             set dados = excluded.dados || jsonb_build_object('primeira_vez', posts.dados->'primeira_vez')
           returning (xmax = 0) as novo`,
          [p.id, JSON.stringify({ ...p, primeira_vez: p.coletado_em })],
        );
        if (rows[0]?.novo) criados += 1;
      }
      return criados;
    },
    async listarPosts() {
      const { rows } = await pool.query("select dados from posts");
      return rows.map((r) => r.dados);
    },
    async gravarRodada(r) {
      await pool.query("insert into rodadas (dados) values ($1::jsonb)", [JSON.stringify(r)]);
    },
    async listarRodadas() {
      const { rows } = await pool.query(
        "select dados from (select id, dados from rodadas order by id desc limit 500) t order by id",
      );
      return rows.map((r) => r.dados);
    },
  };
}

export async function abrirLoja() {
  const loja = config.databaseUrl ? await lojaPostgres(config.databaseUrl) : lojaArquivo();
  await loja.iniciar();
  return loja;
}
