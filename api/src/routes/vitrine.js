import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carregar catálogo mestre
const catalogoPath = path.resolve(__dirname, '../../../db/catalogo_mestre.json');
const catalogo = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchOverpassWithRetry(script, timeoutMs = 120000) {
  const url = 'https://overpass-api.de/api/interpreter';
  
  const makeRequest = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(script),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Plataforma-Alcancabilidade-TCC/1.0'
        },
        signal: controller.signal
      });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  try {
    const res = await makeRequest();
    if (res.status === 429 || res.status >= 500) {
      console.warn(`Overpass retornou status ${res.status}. Tentando novamente em 10 segundos...`);
      await delay(10000);
      const retryRes = await makeRequest();
      return retryRes;
    }
    return res;
  } catch (err) {
    console.warn(`Erro na chamada ao Overpass: ${err.message}. Tentando novamente em 10 segundos...`);
    await delay(10000);
    return await makeRequest();
  }
}

router.get('/', async (req, res, next) => {
  const { osm_tipo, osm_id } = req.query;

  const idNum = parseInt(osm_id, 10);
  if (!osm_tipo || (osm_tipo !== 'relation' && osm_tipo !== 'way') || isNaN(idNum)) {
    return res.status(400).json({
      erro: "Os parâmetros 'osm_tipo' (relation|way) e 'osm_id' (número) são obrigatórios.",
      codigo: 400
    });
  }

  const areaId = osm_tipo === 'relation' ? 3600000000 + idNum : 2400000000 + idNum;

  // Verificar cache
  const cached = cache.get(areaId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return res.json(cached.data);
  }

  // Construir script Overpass
  const lines = [
    '[out:json][timeout:90];',
    `area(${areaId})->.a;`
  ];

  for (const item of catalogo) {
    const key = Object.keys(item.tag)[0];
    const val = item.tag[key];
    lines.push(`nwr["${key}"="${val}"](area.a); out count;`);
  }

  const script = lines.join('\n');

  try {
    const response = await fetchOverpassWithRetry(script);

    if (!response.ok) {
      return res.status(503).json({
        erro: "OpenStreetMap sobrecarregado; tente em instantes.",
        codigo: 503
      });
    }

    const data = await response.json();
    const elements = data.elements || [];

    const results = [];
    for (let i = 0; i < catalogo.length; i++) {
      const count = parseInt(elements[i]?.tags?.total || '0', 10);
      if (count > 0) {
        results.push({
          chave: catalogo[i].chave,
          rotulo: catalogo[i].rotulo,
          grupo: catalogo[i].grupo,
          cor: catalogo[i].cor,
          padrao: catalogo[i].padrao,
          quantidade: count
        });
      }
    }

    cache.set(areaId, { timestamp: Date.now(), data: results });
    res.json(results);

  } catch (error) {
    console.error("Erro na consulta da vitrine ao Overpass:", error);
    res.status(503).json({
      erro: "OpenStreetMap sobrecarregado ou fora do ar; tente em instantes.",
      codigo: 503
    });
  }
});

export default router;
