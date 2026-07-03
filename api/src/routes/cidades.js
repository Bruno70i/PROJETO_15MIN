import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Auxiliar para obter chaves válidas de categoria
async function getCategoriasValidas() {
  const { rows } = await pool.query("SELECT chave FROM categoria_servico WHERE id != 0");
  return rows.map(r => r.chave);
}

// 1. GET /cidades - Lista cidades processadas
router.get('/', async (req, res, next) => {
  try {
    const query = `
      SELECT c.id, c.nome, c.pais, c.consulta_osm, c.data_calculo, c.qtd_nos, c.limiar_minutos,
             COALESCE(i.indice, 0.0) AS indice_geral
      FROM cidade c
      LEFT JOIN indice_cidade i ON i.cidade_id = c.id AND i.categoria_id = 0
      ORDER BY c.nome ASC
    `;
    const { rows } = await pool.query(query);
    
    // Converte os tipos numéricos do pg
    const cidades = rows.map(r => ({
      id: r.id,
      nome: r.nome,
      pais: r.pais,
      consulta_osm: r.consulta_osm,
      data_calculo: r.data_calculo,
      qtd_nos: r.qtd_nos,
      limiar_minutos: r.limiar_minutos,
      indice_geral: parseFloat(r.indice_geral)
    }));
    
    res.json(cidades);
  } catch (error) {
    next(error);
  }
});

// 2. GET /cidades/:id - Detalhe + array de índices por categoria
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const cidadeId = parseInt(id, 10);
  
  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O ID da cidade deve ser um numero inteiro", codigo: 400 });
  }
  
  try {
    const cityRes = await pool.query("SELECT * FROM cidade WHERE id = $1", [cidadeId]);
    if (cityRes.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const c = cityRes.rows[0];
    
    const indicesRes = await pool.query(`
      SELECT cat.chave, cat.rotulo, cat.cor_hex,
             ic.tempo_medio_min, ic.pct_dentro_limiar, ic.indice
      FROM indice_cidade ic
      JOIN categoria_servico cat ON cat.id = ic.categoria_id
      WHERE ic.cidade_id = $1
      ORDER BY cat.id ASC
    `, [cidadeId]);
    
    const indices = indicesRes.rows.map(r => ({
      chave: r.chave,
      rotulo: r.rotulo,
      cor_hex: r.cor_hex,
      tempo_medio_min: r.tempo_medio_min !== null ? parseFloat(r.tempo_medio_min) : null,
      pct_dentro_limiar: parseFloat(r.pct_dentro_limiar),
      indice: parseFloat(r.indice)
    }));
    
    res.json({
      id: c.id,
      nome: c.nome,
      pais: c.pais,
      consulta_osm: c.consulta_osm,
      data_calculo: c.data_calculo,
      qtd_nos: c.qtd_nos,
      qtd_arestas: c.qtd_arestas,
      tempo_execucao_s: parseFloat(c.tempo_execucao_s),
      velocidade_kmh: parseFloat(c.velocidade_kmh),
      limiar_minutos: c.limiar_minutos,
      indices
    });
  } catch (error) {
    next(error);
  }
});

// 3. GET /cidades/:id/servicos - Retorna serviços cadastrados
router.get('/:id/servicos', async (req, res, next) => {
  const { id } = req.params;
  const { categoria } = req.query;
  const cidadeId = parseInt(id, 10);
  
  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O ID da cidade deve ser um numero inteiro", codigo: 400 });
  }
  
  try {
    // Valida se a cidade existe
    const cityCheck = await pool.query("SELECT id FROM cidade WHERE id = $1", [cidadeId]);
    if (cityCheck.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    
    let query = `
      SELECT s.id, s.nome, s.lat, s.lon, cat.chave AS categoria, cat.rotulo
      FROM servico s
      JOIN categoria_servico cat ON cat.id = s.categoria_id
      WHERE s.cidade_id = $1
    `;
    const params = [cidadeId];
    
    if (categoria) {
      const validas = await getCategoriasValidas();
      if (!validas.includes(categoria)) {
        return res.status(400).json({
          erro: `Categoria invalida. Categorias disponiveis: ${validas.join(', ')}`,
          codigo: 400
        });
      }
      query += " AND cat.chave = $2";
      params.push(categoria);
    } else {
      // Se não há filtro de categoria, precisamos contar para não estourar 5000 features
      const countRes = await pool.query("SELECT count(*) FROM servico WHERE cidade_id = $1", [cidadeId]);
      const total = parseInt(countRes.rows[0].count, 10);
      if (total > 5000) {
        return res.status(400).json({
          erro: `A cidade possui ${total} servicos cadastrados. Forneca um filtro de 'categoria' para buscar (limite de 5000 excedido).`,
          codigo: 400
        });
      }
    }
    
    const { rows } = await pool.query(query, params);
    
    const features = rows.map(r => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(r.lon), parseFloat(r.lat)]
      },
      properties: {
        id: parseInt(r.id, 10),
        nome: r.nome,
        categoria: r.categoria,
        rotulo: r.rotulo
      }
    }));
    
    res.json({
      type: "FeatureCollection",
      features
    });
  } catch (error) {
    next(error);
  }
});

// 5. GET /cidades/:id/mapa - Amostra de nós para heatmap
router.get('/:id/mapa', async (req, res, next) => {
  const { id } = req.params;
  const { categoria, max } = req.query;
  const cidadeId = parseInt(id, 10);
  const maxLimit = parseInt(max || '3000', 10);
  
  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O ID da cidade deve ser um numero inteiro", codigo: 400 });
  }
  
  if (!categoria) {
    return res.status(400).json({ erro: "O parametro 'categoria' e obrigatorio", codigo: 400 });
  }
  
  try {
    // Valida se a cidade existe
    const cityCheck = await pool.query("SELECT id FROM cidade WHERE id = $1", [cidadeId]);
    if (cityCheck.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    
    const validas = await getCategoriasValidas();
    if (!validas.includes(categoria)) {
      return res.status(400).json({
        erro: `Categoria invalida. Categorias disponiveis: ${validas.join(', ')}`,
        codigo: 400
      });
    }
    
    // Query com amostragem aleatória ordenada e limitada
    const query = `
      SELECT n.lat, n.lon, a.tempo_min, a.dentro_limiar
      FROM no n
      JOIN alcancabilidade_no a ON a.osm_no_id = n.osm_id AND a.cidade_id = n.cidade_id
      JOIN categoria_servico cat ON cat.id = a.categoria_id
      WHERE n.cidade_id = $1 AND cat.chave = $2
      ORDER BY random()
      LIMIT $3
    `;
    const { rows } = await pool.query(query, [cidadeId, categoria, maxLimit]);
    
    const pontos = rows.map(r => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      tempo_min: r.tempo_min !== null ? parseFloat(r.tempo_min) : null,
      dentro_limiar: r.dentro_limiar
    }));
    
    res.json(pontos);
  } catch (error) {
    next(error);
  }
});

export default router;
