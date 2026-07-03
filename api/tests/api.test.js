import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/db.js';

describe('API Integration Tests', () => {
  let cidadeTestId;
  let latCentro;
  let lonCentro;
  
  beforeAll(async () => {
    // Busca a cidade processada no banco
    const { rows } = await pool.query(
      "SELECT id FROM cidade WHERE consulta_osm = $1",
      ["Águas de São Pedro, São Paulo, Brazil"]
    );
    if (rows.length > 0) {
      cidadeTestId = rows[0].id;
      
      // Busca um nó qualquer dessa cidade para ter lat/lon válidos
      const noRes = await pool.query(
        "SELECT lat, lon FROM no WHERE cidade_id = $1 LIMIT 1",
        [cidadeTestId]
      );
      if (noRes.rows.length > 0) {
        latCentro = noRes.rows[0].lat;
        lonCentro = noRes.rows[0].lon;
      }
    } else {
      throw new Error("Cidade de teste 'Águas de São Pedro' nao encontrada no banco. Rode o algoritmo antes.");
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/v1/saude -> 200 e banco: true', async () => {
    const res = await request(app).get('/api/v1/saude');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.banco).toBe(true);
  });

  it('GET /api/v1/cidades -> 200, array com >= 1 cidade e campo indice_geral', async () => {
    const res = await request(app).get('/api/v1/cidades');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('indice_geral');
    expect(typeof res.body[0].indice_geral).toBe('number');
  });

  it('GET /api/v1/cidades/999999 -> 404 com {erro}', async () => {
    const res = await request(app).get('/api/v1/cidades/999999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('erro');
  });

  it('GET /api/v1/alcancabilidade?... -> 200 com lat/lon centrais', async () => {
    const res = await request(app)
      .get(`/api/v1/alcancabilidade?cidade_id=${cidadeTestId}&lat=${latCentro}&lon=${lonCentro}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('no');
    expect(res.body).toHaveProperty('indice_ponto');
    expect(Array.isArray(res.body.categorias)).toBe(true);
    expect(res.body.categorias.length).toBeGreaterThanOrEqual(1);
    
    // Todo tempo_min >= 0 ou null
    res.body.categorias.forEach(cat => {
      if (cat.tempo_min !== null) {
        expect(cat.tempo_min).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('GET /api/v1/alcancabilidade?lat=0&lon=0&cidade_id=... -> 404 (fora da area)', async () => {
    const res = await request(app)
      .get(`/api/v1/alcancabilidade?cidade_id=${cidadeTestId}&lat=0&lon=0`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('erro');
  });

  it('GET /api/v1/cidades/.../servicos?categoria=inexistente -> 400 com chaves validas', async () => {
    const res = await request(app)
      .get(`/api/v1/cidades/${cidadeTestId}/servicos?categoria=inexistente`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
    expect(res.body.erro).toContain('Categoria invalida');
  });

  it('GET /api/v1/rota -> 200 com LineString entre no e servico mais proximo', async () => {
    // Usa o proprio /alcancabilidade para obter um par (no, servico) valido
    const alc = await request(app)
      .get(`/api/v1/alcancabilidade?cidade_id=${cidadeTestId}&lat=${latCentro}&lon=${lonCentro}`);
    expect(alc.status).toBe(200);

    const catComServico = alc.body.categorias.find(
      c => c.servico_mais_proximo && c.tempo_min !== null
    );
    expect(catComServico).toBeDefined();

    const res = await request(app)
      .get(`/api/v1/rota?cidade_id=${cidadeTestId}&de=${alc.body.no.osm_id}&para=${catComServico.servico_mais_proximo.osm_no_id}`);
    expect(res.status).toBe(200);
    expect(res.body.geojson.type).toBe('LineString');
    expect(res.body.geojson.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(res.body.tempo_min).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/v1/rota com parametros invalidos -> 400', async () => {
    const res = await request(app)
      .get(`/api/v1/rota?cidade_id=${cidadeTestId}&de=abc&para=xyz`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
  });
});
