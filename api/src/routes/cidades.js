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

    // Busca diagnóstico de Moreno (Fase 09)
    const morenoRes = await pool.query(`
      SELECT m.*,
             cat.chave AS gargalo_chave,
             cat.rotulo AS gargalo_rotulo,
             cat.cor_hex AS gargalo_cor_hex
      FROM indice_moreno m
      LEFT JOIN categoria_servico cat ON cat.id = m.categoria_gargalo_id
      WHERE m.cidade_id = $1
    `, [cidadeId]);

    let moreno = null;
    if (morenoRes.rows.length > 0) {
      const m = morenoRes.rows[0];
      const ausentesIds = m.categorias_ausentes || [];
      let categorias_ausentes = [];
      if (ausentesIds.length > 0) {
        const ausRes = await pool.query(`
          SELECT chave, rotulo
          FROM categoria_servico
          WHERE id = ANY($1)
          ORDER BY id ASC
        `, [ausentesIds]);
        categorias_ausentes = ausRes.rows.map(r => ({ chave: r.chave, rotulo: r.rotulo }));
      }

      moreno = {
        limiar_minutos: m.limiar_minutos,
        pct_cobertura_plena: parseFloat(m.pct_cobertura_plena),
        minutos_cidade: m.minutos_cidade,
        tempo_pior_medio: m.tempo_pior_medio !== null ? parseFloat(m.tempo_pior_medio) : null,
        tempo_pior_mediana: m.tempo_pior_mediana !== null ? parseFloat(m.tempo_pior_mediana) : null,
        pct_nos_sem_cobertura: parseFloat(m.pct_nos_sem_cobertura),
        atende_conceito: m.atende_conceito,
        classificacao: m.classificacao,
        categoria_gargalo: m.categoria_gargalo_id ? {
          chave: m.gargalo_chave,
          rotulo: m.gargalo_rotulo,
          cor_hex: m.gargalo_cor_hex
        } : null,
        pct_gargalo: m.pct_gargalo !== null ? parseFloat(m.pct_gargalo) : null,
        categorias_ausentes,
        distribuicao: m.distribuicao
      };
    }
    
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
      indices,
      moreno
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

// 5. GET /cidades/:id/mapa - Amostra de nós para heatmap (Fase 10)
router.get('/:id/mapa', async (req, res, next) => {
  const { id } = req.params;
  const { categoria, max, velocidade, categorias } = req.query;
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
    const cityCheck = await pool.query("SELECT * FROM cidade WHERE id = $1", [cidadeId]);
    if (cityCheck.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const city = cityCheck.rows[0];
    const velBase = parseFloat(city.velocidade_kmh);
    const limiar = parseFloat(city.limiar_minutos);

    let velEscolhida = velBase;
    if (velocidade) {
      const v = parseFloat(velocidade);
      if (isNaN(v) || v < 2.0 || v > 6.0) {
        return res.status(400).json({ erro: "A velocidade deve ser um numero entre 2.0 e 6.0", codigo: 400 });
      }
      velEscolhida = v;
    }
    const fator = velBase / velEscolhida;
    
    const validas = await getCategoriasValidas();
    if (categoria !== 'plena' && !validas.includes(categoria)) {
      return res.status(400).json({
        erro: `Categoria invalida. Categorias disponiveis: ${validas.join(', ')}`,
        codigo: 400
      });
    }
    
    let rows = [];
    if (categoria === 'plena') {
      const presentesRes = await pool.query("SELECT DISTINCT categoria_id FROM servico WHERE cidade_id = $1", [cidadeId]);
      let presentesIds = presentesRes.rows.map(r => r.categoria_id);
      
      if (categorias) {
        const chavesSugeridas = categorias.split(',').map(s => s.trim()).filter(Boolean);
        const catRes = await pool.query("SELECT id FROM categoria_servico WHERE chave = ANY($1)", [chavesSugeridas]);
        const idsSugeridos = catRes.rows.map(r => r.id);
        presentesIds = presentesIds.filter(pid => idsSugeridos.includes(pid));
      }

      if (presentesIds.length === 0) {
        return res.json([]);
      }
      
      const query = `
        SELECT n.lat, n.lon,
               CASE WHEN bool_and(a.tempo_min IS NOT NULL)
                    THEN max(a.tempo_min * $3) END AS tempo_min,
               bool_and(a.tempo_min IS NOT NULL AND a.tempo_min * $3 <= $4) AS dentro_limiar
        FROM no n
        JOIN alcancabilidade_no a ON a.cidade_id = n.cidade_id AND a.osm_no_id = n.osm_id
        WHERE n.cidade_id = $1
          AND a.categoria_id = ANY($2)
        GROUP BY n.id, n.lat, n.lon
        ORDER BY random()
        LIMIT $5
      `;
      const result = await pool.query(query, [cidadeId, presentesIds, fator, limiar, maxLimit]);
      rows = result.rows;
    } else {
      // Query com amostragem aleatória ordenada e limitada
      const query = `
        SELECT n.lat, n.lon, (a.tempo_min * $3) as tempo_min, (a.tempo_min * $3 <= $4) as dentro_limiar
        FROM no n
        JOIN alcancabilidade_no a ON a.osm_no_id = n.osm_id AND a.cidade_id = n.cidade_id
        JOIN categoria_servico cat ON cat.id = a.categoria_id
        WHERE n.cidade_id = $1 AND cat.chave = $2
        ORDER BY random()
        LIMIT $5
      `;
      const result = await pool.query(query, [cidadeId, categoria, fator, limiar, maxLimit]);
      rows = result.rows;
    }
    
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

// 6. GET /cidades/:id/moreno - Diagnóstico Moreno Dinâmico (Fase 10)
router.get('/:id/moreno', async (req, res, next) => {
  const { id } = req.params;
  const { categorias, velocidade } = req.query;
  const cidadeId = parseInt(id, 10);
  
  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O ID da cidade deve ser um numero inteiro", codigo: 400 });
  }
  
  try {
    // 1. Busca informações da cidade
    const cityRes = await pool.query("SELECT * FROM cidade WHERE id = $1", [cidadeId]);
    if (cityRes.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const cidade = cityRes.rows[0];
    const velBase = parseFloat(cidade.velocidade_kmh);
    const limiar = parseFloat(cidade.limiar_minutos);

    // 2. Valida e analisa a velocidade
    let velEscolhida = velBase;
    if (velocidade) {
      const v = parseFloat(velocidade);
      if (isNaN(v) || v < 2.0 || v > 6.0) {
        return res.status(400).json({ erro: "A velocidade deve ser um numero entre 2.0 e 6.0", codigo: 400 });
      }
      velEscolhida = v;
    }
    const fator = velBase / velEscolhida;

    // 3. Busca categorias
    const catRes = await pool.query("SELECT id, chave, rotulo, cor_hex FROM categoria_servico WHERE id != 0");
    const todasCategorias = catRes.rows;
    const chaveParaCat = new Map(todasCategorias.map(c => [c.chave, c]));

    const presentesRes = await pool.query("SELECT DISTINCT categoria_id FROM servico WHERE cidade_id = $1", [cidadeId]);
    const presentesIds = new Set(presentesRes.rows.map(r => r.categoria_id));

    let categoriasEscolhidas = todasCategorias.filter(c => presentesIds.has(c.id));
    let categoriasAusentesQuery = [];

    if (categorias) {
      const chavesSugeridas = categorias.split(',').map(s => s.trim()).filter(Boolean);
      if (chavesSugeridas.length === 0) {
        return res.status(400).json({ erro: "Lista de categorias vazia", codigo: 400 });
      }

      const chavesValidas = new Set(todasCategorias.map(c => c.chave));
      for (const key of chavesSugeridas) {
        if (!chavesValidas.has(key)) {
          return res.status(400).json({ erro: `Categoria invalida: ${key}`, codigo: 400 });
        }
      }

      const categoriasEscolhidasValidas = [];
      const ausentesSet = new Set();
      chavesSugeridas.forEach(key => {
        const catObj = chaveParaCat.get(key);
        if (presentesIds.has(catObj.id)) {
          categoriasEscolhidasValidas.push(catObj);
        } else {
          ausentesSet.add(catObj.chave);
        }
      });

      if (categoriasEscolhidasValidas.length === 0) {
        return res.status(400).json({ erro: "Nenhuma das categorias selecionadas esta presente nesta cidade.", codigo: 400 });
      }

      categoriasEscolhidas = categoriasEscolhidasValidas;
      categoriasAusentesQuery = todasCategorias.filter(c => ausentesSet.has(c.chave));
    } else {
      categoriasAusentesQuery = todasCategorias.filter(c => !presentesIds.has(c.id));
    }

    const idsEscolhidos = categoriasEscolhidas.map(c => c.id);

    // 4. Executa query dinâmica de Moreno
    const mainQuery = `
      WITH por_no AS (
        SELECT a.osm_no_id,
               CASE WHEN bool_and(a.tempo_min IS NOT NULL)
                    THEN max(a.tempo_min * $3) END AS tempo_pior
        FROM alcancabilidade_no a
        WHERE a.cidade_id = $1 AND a.categoria_id = ANY($2)
        GROUP BY a.osm_no_id
      )
      SELECT count(*)                                            AS total_nos,
             round(100.0 * avg((tempo_pior <= $4)::int), 2)      AS pct_cobertura_plena,
             round(100.0 * avg((tempo_pior IS NULL)::int), 2)    AS pct_nos_sem_cobertura,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY tempo_pior) AS p90,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY tempo_pior) AS mediana,
             avg(tempo_pior)                                     AS media
      FROM por_no;
    `;
    const resultRes = await pool.query(mainQuery, [cidadeId, idsEscolhidos, fator, limiar]);
    const mainStats = resultRes.rows[0];

    // 5. Query de Cobertura por categoria
    const listQuery = `
      SELECT a.categoria_id,
             round(100.0 * avg((a.tempo_min IS NOT NULL AND a.tempo_min * $3 <= $4)::int), 2) AS pct_dentro
      FROM alcancabilidade_no a
      WHERE a.cidade_id = $1 AND a.categoria_id = ANY($2)
      GROUP BY a.categoria_id;
    `;
    const listRes = await pool.query(listQuery, [cidadeId, idsEscolhidos, fator, limiar]);
    
    let gargalo = null;
    let minPct = 101.0;
    const categoriasResultado = [];

    listRes.rows.forEach(r => {
      const catObj = todasCategorias.find(c => c.id === r.categoria_id);
      if (!catObj) return;
      const pct = parseFloat(r.pct_dentro);
      categoriasResultado.push({
        chave: catObj.chave,
        rotulo: catObj.rotulo,
        cor_hex: catObj.cor_hex,
        pct_dentro: pct
      });

      if (pct < minPct) {
        minPct = pct;
        gargalo = {
          chave: catObj.chave,
          rotulo: catObj.rotulo,
          cor_hex: catObj.cor_hex,
          pct: pct
        };
      }
    });

    // 6. Histograma
    const histQuery = `
      WITH por_no AS (
        SELECT a.osm_no_id,
               CASE WHEN bool_and(a.tempo_min IS NOT NULL)
                    THEN max(a.tempo_min * $3) END AS tempo_pior
        FROM alcancabilidade_no a
        WHERE a.cidade_id = $1 AND a.categoria_id = ANY($2)
        GROUP BY a.osm_no_id
      )
      SELECT tempo_pior FROM por_no;
    `;
    const histRes = await pool.query(histQuery, [cidadeId, idsEscolhidos, fator]);
    
    const tempos = histRes.rows.map(r => r.tempo_pior).filter(t => t !== null && t !== undefined);
    const totalNos = histRes.rowCount;
    const countSemCobertura = totalNos - tempos.length;

    const bins = [
      { faixa: '0_5', min: 0, max: 5, qtd: 0 },
      { faixa: '5_10', min: 5, max: 10, qtd: 0 },
      { faixa: '10_15', min: 10, max: 15, qtd: 0 },
      { faixa: '15_20', min: 15, max: 20, qtd: 0 },
      { faixa: '20_25', min: 20, max: 25, qtd: 0 },
      { faixa: '25_30', min: 25, max: 30, qtd: 0 },
      { faixa: 'mais_30', min: 30, max: Infinity, qtd: 0 },
    ];

    tempos.forEach(t => {
      for (const b of bins) {
        if (t > b.min && t <= b.max) {
          b.qtd++;
          break;
        } else if (b.min === 0 && t >= 0 && t <= 5) {
          b.qtd++;
          break;
        }
      }
    });

    const distribuicao = bins.map(b => ({ faixa: b.faixa, qtd: b.qtd }));
    distribuicao.push({ faixa: 'sem_cobertura', qtd: countSemCobertura });

    const p90 = mainStats.p90 !== null ? parseFloat(mainStats.p90) : null;
    const minutosCidade = p90 !== null ? Math.ceil(p90) : null;
    const atendeConceito = minutosCidade !== null ? minutosCidade <= limiar : false;

    let classificacao = "Distante do conceito";
    if (minutosCidade !== null) {
      if (minutosCidade <= 15) classificacao = "Cidade de 15 Minutos";
      else if (minutosCidade <= 20) classificacao = "Muito proxima do conceito";
      else if (minutosCidade <= 30) classificacao = "Parcialmente aderente";
    }

    res.json({
      limiar_minutos: limiar,
      pct_cobertura_plena: mainStats.pct_cobertura_plena !== null ? parseFloat(mainStats.pct_cobertura_plena) : 0.0,
      minutos_cidade: minutosCidade,
      tempo_pior_medio: mainStats.media !== null ? parseFloat(mainStats.media) : null,
      tempo_pior_mediana: mainStats.mediana !== null ? parseFloat(mainStats.mediana) : null,
      pct_nos_sem_cobertura: mainStats.pct_nos_sem_cobertura !== null ? parseFloat(mainStats.pct_nos_sem_cobertura) : 0.0,
      atende_conceito: atendeConceito,
      classificacao: classificacao,
      categoria_gargalo: gargalo ? {
        chave: gargalo.chave,
        rotulo: gargalo.rotulo,
        cor_hex: gargalo.cor_hex
      } : null,
      pct_gargalo: gargalo ? gargalo.pct : null,
      categorias_ausentes: categoriasAusentesQuery.map(c => ({ chave: c.chave, rotulo: c.rotulo })),
      distribuicao: distribuicao,
      categorias_resultado: categoriasResultado,
      parametros: {
        categorias_usadas: categoriasEscolhidas.map(c => c.chave),
        velocidade_kmh: velEscolhida,
        dinamico: true
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;
