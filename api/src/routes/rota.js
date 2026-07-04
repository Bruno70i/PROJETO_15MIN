import express from 'express';
import pool from '../db.js';
import { carregarGrafo, dijkstra, montarGeometria } from '../lib/grafo.js';

const router = express.Router();

// GET /api/v1/rota?cidade_id=&de=&para=&velocidade=
// 'de' e 'para' são osm_id de nós do grafo da cidade.
router.get('/', async (req, res, next) => {
  const cidadeId = parseInt(req.query.cidade_id, 10);
  const de = String(req.query.de || '');
  const para = String(req.query.para || '');
  const { velocidade } = req.query;

  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O parametro 'cidade_id' deve ser um numero inteiro", codigo: 400 });
  }
  if (!/^\d+$/.test(de) || !/^\d+$/.test(para)) {
    return res.status(400).json({ erro: "Os parametros 'de' e 'para' devem ser osm_id de nos (inteiros)", codigo: 400 });
  }

  try {
    // Busca velocidade base da cidade
    const cityRes = await pool.query("SELECT velocidade_kmh FROM cidade WHERE id = $1", [cidadeId]);
    if (cityRes.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const city = cityRes.rows[0];
    const velBase = parseFloat(city.velocidade_kmh);

    let velEscolhida = velBase;
    if (velocidade) {
      const v = parseFloat(velocidade);
      if (isNaN(v) || v < 2.0 || v > 6.0) {
        return res.status(400).json({ erro: "A velocidade deve ser um numero entre 2.0 e 6.0", codigo: 400 });
      }
      velEscolhida = v;
    }
    const fator = velBase / velEscolhida;

    const adj = await carregarGrafo(cidadeId);
    if (!adj) {
      return res.status(404).json({
        erro: 'Cidade nao encontrada ou sem malha viaria gravada. Reprocesse a cidade com a versao atual do algoritmo.',
        codigo: 404
      });
    }

    const resultado = dijkstra(adj, de, para);
    if (!resultado) {
      return res.status(404).json({ erro: 'Nao ha caminho na malha viaria entre os dois pontos', codigo: 404 });
    }

    // A rota mais rápida (menor caminho) permanece inalterada porque a velocidade
    // de caminhada é uniforme sobre todo o grafo viário. Apenas o tempo_min de 
    // viagem é escalado linearmente.
    res.json({
      tempo_min: parseFloat(((resultado.tempoS / 60) * fator).toFixed(2)),
      qtd_nos_caminho: resultado.caminho.length,
      geojson: montarGeometria(adj, resultado.caminho),
      velocidade_kmh_aplicada: velEscolhida
    });
  } catch (error) {
    next(error);
  }
});

export default router;
