import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'alcancabilidade',
  user: 'postgres',
  password: '123'
});

const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
  try {
    const { rows: cidades } = await pool.query("SELECT id, nome, consulta_osm FROM cidade");
    console.log(`Encontradas ${cidades.length} cidades para backfill.`);

    for (const cidade of cidades) {
      console.log(`Geocodificando: ${cidade.consulta_osm} (ID: ${cidade.id})...`);
      
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(cidade.consulta_osm)}&limit=5&addressdetails=1&accept-language=pt-BR`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Plataforma-Alcancabilidade-TCC/1.0'
        }
      });

      if (!response.ok) {
        console.error(`Erro ao geocodificar ${cidade.nome}: Status ${response.status}`);
        await delay(1000);
        continue;
      }

      const results = await response.json();
      // Filtrar por osm_type em relation ou way, e class em boundary ou place
      const filtered = results.filter(r => 
        (r.osm_type === 'relation' || r.osm_type === 'way') && 
        (r.class === 'boundary' || r.class === 'place')
      );

      if (filtered.length === 0) {
        console.log(`Nenhum limite administrativo correspondente encontrado para ${cidade.nome}. Tentando primeiro resultado geral...`);
        if (results.length > 0) {
          const first = results[0];
          console.log(`Usando fallback: ${first.display_name} (${first.osm_type} ${first.osm_id})`);
          await pool.query(
            "UPDATE cidade SET osm_limite_tipo = $1, osm_limite_id = $2 WHERE id = $3",
            [first.osm_type, first.osm_id, cidade.id]
          );
        } else {
          console.warn(`Nenhum resultado de geocodificação para ${cidade.consulta_osm}`);
        }
      } else {
        const match = filtered[0];
        console.log(`Sucesso: ${match.display_name} (${match.osm_type} ${match.osm_id})`);
        await pool.query(
          "UPDATE cidade SET osm_limite_tipo = $1, osm_limite_id = $2 WHERE id = $3",
          [match.osm_type, match.osm_id, cidade.id]
        );
      }

      // Esperar 1 segundo para respeitar o rate limit do Nominatim
      await delay(1000);
    }

    console.log("Populando cidade_categoria com os dados de alcancabilidade_no existentes...");
    await pool.query(`
      INSERT INTO cidade_categoria (cidade_id, categoria_id)
      SELECT DISTINCT cidade_id, categoria_id FROM alcancabilidade_no
      ON CONFLICT DO NOTHING
    `);
    console.log("cidade_categoria preenchida!");

    console.log("Backfill concluído com sucesso!");
  } catch (err) {
    console.error("Erro no processo de backfill:", err);
  } finally {
    await pool.end();
  }
}

main();
