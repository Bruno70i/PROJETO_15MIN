import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Helper para rodar query de busca de nó mais próximo com um certo delta
async function encontrarNoMaisProximo(cidadeId, lat, lon, delta) {
  const query = `
    SELECT n.osm_id AS osm_no_id, n.lat, n.lon,
           2 * 6371000 * asin(sqrt(
             pow(sin(radians(($1 - n.lat)/2)), 2) +
             cos(radians($1)) * cos(radians(n.lat)) *
             pow(sin(radians(($2 - n.lon)/2)), 2)
           )) AS dist_m
    FROM no n
    WHERE n.cidade_id = $3
      AND n.lat BETWEEN $1 - $4 AND $1 + $4
      AND n.lon BETWEEN $2 - $4 AND $2 + $4
    ORDER BY dist_m
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [lat, lon, cidadeId, delta]);
  return rows[0] || null;
}

// 6. GET /alcancabilidade - Endpoint principal
router.get('/', async (req, res, next) => {
  const { cidade_id, lat, lon } = req.query;
  
  const cidadeId = parseInt(cidade_id, 10);
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);
  
  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O parametro 'cidade_id' deve ser um numero inteiro", codigo: 400 });
  }
  
  if (isNaN(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({ erro: "A latitude deve ser um numero entre -90 e 90", codigo: 400 });
  }
  
  if (isNaN(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ erro: "A longitude deve ser um numero entre -180 e 180", codigo: 400 });
  }
  
  try {
    // 1. Valida se a cidade existe
    const cityCheck = await pool.query("SELECT * FROM cidade WHERE id = $1", [cidadeId]);
    if (cityCheck.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const city = cityCheck.rows[0];
    const velBase = parseFloat(city.velocidade_kmh);
    const limiar = parseFloat(city.limiar_minutos);

    // Valida e aplica velocidade se fornecida
    let velEscolhida = velBase;
    const { velocidade } = req.query;
    if (velocidade) {
      const v = parseFloat(velocidade);
      if (isNaN(v) || v < 2.0 || v > 6.0) {
        return res.status(400).json({ erro: "A velocidade deve ser um numero entre 2.0 e 6.0", codigo: 400 });
      }
      velEscolhida = v;
    }
    const fator = velBase / velEscolhida;
    
    // 2. Busca o nó mais próximo com delta = 0.02
    let no = await encontrarNoMaisProximo(cidadeId, latitude, longitude, 0.02);
    
    if (!no) {
      // Repete com delta = 0.1
      no = await encontrarNoMaisProximo(cidadeId, latitude, longitude, 0.1);
    }
    
    if (!no) {
      return res.status(404).json({
        erro: "Ponto fora da area de cobertura processada para esta cidade",
        codigo: 404
      });
    }
    
    // 3. Busca alcançabilidade de todas as categorias para este nó
    const queryAlcancabilidade = `
      SELECT cat.chave, cat.rotulo, cat.cor_hex, a.tempo_min,
             s.id AS servico_id, s.nome AS servico_nome, s.lat AS servico_lat, s.lon AS servico_lon,
             s.osm_no_id AS servico_osm_no_id
      FROM alcancabilidade_no a
      JOIN categoria_servico cat ON cat.id = a.categoria_id
      LEFT JOIN servico s ON s.id = a.servico_id
      WHERE a.cidade_id = $1 AND a.osm_no_id = $2
      ORDER BY cat.id ASC
    `;
    const { rows } = await pool.query(queryAlcancabilidade, [cidadeId, no.osm_no_id]);
    
    const categorias = rows.map(r => {
      let servico = null;
      if (r.servico_id !== null) {
        servico = {
          id: parseInt(r.servico_id, 10),
          nome: r.servico_nome,
          lat: parseFloat(r.servico_lat),
          lon: parseFloat(r.servico_lon),
          osm_no_id: String(r.servico_osm_no_id)
        };
      }
      
      const tempoMinScaled = r.tempo_min !== null ? parseFloat(r.tempo_min) * fator : null;
      const dentroLimiar = tempoMinScaled !== null ? (tempoMinScaled <= limiar) : false;

      return {
        chave: r.chave,
        rotulo: r.rotulo,
        cor_hex: r.cor_hex,
        tempo_min: tempoMinScaled !== null ? parseFloat(tempoMinScaled.toFixed(2)) : null,
        dentro_limiar: dentroLimiar,
        servico_mais_proximo: servico
      };
    });
    
    // 4. Calcula índice do ponto na hora
    const totalCategorias = categorias.length;
    const dentroLimiarCount = categorias.filter(c => c.dentro_limiar).length;
    const indice_ponto = totalCategorias > 0 ? (dentroLimiarCount / totalCategorias) * 100.0 : 0.0;
    
    res.json({
      no: {
        osm_id: parseInt(no.osm_no_id, 10),
        lat: parseFloat(no.lat),
        lon: parseFloat(no.lon),
        distancia_m: parseFloat(no.dist_m)
      },
      indice_ponto: parseFloat(indice_ponto.toFixed(2)),
      velocidade_kmh_aplicada: velEscolhida,
      categorias
    });
  } catch (error) {
    next(error);
  }
});

export default router;
