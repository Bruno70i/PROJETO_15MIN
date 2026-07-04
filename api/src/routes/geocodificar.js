import express from 'express';
import pool from '../db.js';

const router = express.Router();
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

let nominatimQueue = Promise.resolve();

async function queueNominatim(url) {
  return new Promise((resolve, reject) => {
    nominatimQueue = nominatimQueue
      .then(async () => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Plataforma-Alcancabilidade-TCC/1.0'
            }
          });
          resolve(response);
        } catch (err) {
          reject(err);
        }
        // Aguarda 1 segundo antes de permitir a próxima requisição na fila
        await new Promise(r => setTimeout(r, 1000));
      });
  });
}

router.get('/', async (req, res, next) => {
  const { q } = req.query;

  if (typeof q !== 'string' || q.length < 3 || q.length > 120) {
    return res.status(400).json({
      erro: "A consulta deve ser uma string contendo entre 3 e 120 caracteres.",
      codigo: 400
    });
  }

  const safeRegex = /^[\p{L}\p{N}\s,.\-']+$/u;
  if (!safeRegex.test(q)) {
    return res.status(400).json({
      erro: "A consulta contem caracteres nao permitidos.",
      codigo: 400
    });
  }

  const normalizedQ = q.toLowerCase().trim().replace(/\s+/g, ' ');

  // Verificar cache
  const cachedVal = cache.get(normalizedQ);
  if (cachedVal && (Date.now() - cachedVal.timestamp < CACHE_TTL)) {
    try {
      const results = await populateAlreadyProcessed(cachedVal.data);
      return res.json(results);
    } catch (err) {
      return next(err);
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(normalizedQ)}&limit=10&addressdetails=1&accept-language=pt-BR`;
    const response = await queueNominatim(url);

    if (!response.ok) {
      return res.status(502).json({
        erro: "Serviço de busca indisponível; tente em instantes.",
        codigo: 502
      });
    }

    const rawData = await response.json();
    // Atencao: no format=jsonv2 do Nominatim o campo chama-se 'category'
    // (no format=json antigo era 'class') — aceitar ambos.
    const filtered = rawData
      .filter(r => {
        const classe = r.category ?? r.class;
        return (r.osm_type === 'relation' || r.osm_type === 'way')
          && (classe === 'boundary' || classe === 'place');
      })
      .slice(0, 5)
      .map(r => ({
        osm_tipo: r.osm_type,
        osm_id: parseInt(r.osm_id, 10),
        nome_exibicao: r.display_name,
        tipo: r.addresstype || r.type,
        ja_processada: false,
        cidade_id: null
      }));

    cache.set(normalizedQ, { timestamp: Date.now(), data: filtered });

    const results = await populateAlreadyProcessed(filtered);
    res.json(results);

  } catch (error) {
    console.error("Erro no geocodificador Nominatim:", error);
    res.status(502).json({
      erro: "Serviço de busca indisponível; tente em instantes.",
      codigo: 502
    });
  }
});

async function populateAlreadyProcessed(items) {
  const result = [];
  for (const item of items) {
    const cloned = { ...item };
    const checkQuery = "SELECT id FROM cidade WHERE osm_limite_tipo = $1 AND osm_limite_id = $2";
    const { rows } = await pool.query(checkQuery, [cloned.osm_tipo, cloned.osm_id]);
    if (rows.length > 0) {
      cloned.ja_processada = true;
      cloned.cidade_id = rows[0].id;
    }
    result.push(cloned);
  }
  return result;
}

export default router;
