import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'alcancabilidade',
  user: 'postgres',
  password: '123'
});

async function main() {
  try {
    console.log("Alterando tabela 'cidade'...");
    await pool.query(`
      ALTER TABLE cidade ADD COLUMN IF NOT EXISTS osm_limite_tipo TEXT;
      ALTER TABLE cidade ADD COLUMN IF NOT EXISTS osm_limite_id  BIGINT;
    `);

    console.log("Criando índice único condicional...");
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cidade_osm_limite
      ON cidade (osm_limite_tipo, osm_limite_id)
      WHERE osm_limite_id IS NOT NULL;
    `);

    console.log("Criando tabela 'cidade_categoria'...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cidade_categoria (
          cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
          categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
          PRIMARY KEY (cidade_id, categoria_id)
      );
    `);

    console.log("Banco de dados alterado com sucesso!");
  } catch (err) {
    console.error("Erro ao alterar banco de dados:", err);
  } finally {
    await pool.end();
  }
}

main();
