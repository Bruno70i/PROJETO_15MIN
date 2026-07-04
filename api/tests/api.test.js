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

  // Novos Testes da Fase 08 & 09
  it('POST /api/v1/processamentos com body vazio -> 400', async () => {
    const res = await request(app).post('/api/v1/processamentos').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
  });

  it('POST /api/v1/processamentos com caracteres proibidos -> 400', async () => {
    const res = await request(app).post('/api/v1/processamentos').send({ consulta_osm: "cidade; rm -rf" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
  });

  it('POST /api/v1/processamentos com cidade já processada -> 200 com ja_processada: true', async () => {
    const res = await request(app).post('/api/v1/processamentos').send({ consulta_osm: "Águas de São Pedro, São Paulo, Brazil" });
    expect(res.status).toBe(200);
    expect(res.body.ja_processada).toBe(true);
    expect(res.body).toHaveProperty('cidade_id');
  });

  it('GET /api/v1/processamentos/atual -> 200 com job (objeto ou null)', async () => {
    const res = await request(app).get('/api/v1/processamentos/atual');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('job');
  });

  it('GET /api/v1/cidades/:id/mapa?categoria=plena -> 200', async () => {
    const res = await request(app).get(`/api/v1/cidades/${cidadeTestId}/mapa?categoria=plena`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Novos Testes da Fase 10 (Análise Configurável)
  it('GET /api/v1/cidades/:id/moreno sem params -> 200 com valores corretos', async () => {
    const res = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('minutos_cidade');
    expect(res.body).toHaveProperty('pct_cobertura_plena');
    expect(res.body).toHaveProperty('categoria_gargalo');
    expect(res.body).toHaveProperty('distribuicao');
  });

  it('GET /api/v1/cidades/:id/moreno?velocidade=6 -> minutos_cidade diminui', async () => {
    const defaultRes = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno`);
    const fastRes = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?velocidade=6`);
    expect(fastRes.status).toBe(200);
    if (defaultRes.body.minutos_cidade !== null && fastRes.body.minutos_cidade !== null) {
      expect(fastRes.body.minutos_cidade).toBeLessThanOrEqual(defaultRes.body.minutos_cidade);
    }
  });

  it('GET /api/v1/cidades/:id/moreno?categorias=farmacia -> 200', async () => {
    const res = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?categorias=farmacia`);
    expect(res.status).toBe(200);
    expect(res.body.parametros.categorias_usadas).toContain('farmacia');
  });

  it('GET /api/v1/cidades/:id/moreno com parametros invalidos -> 400', async () => {
    const invalidCat = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?categorias=chave_invalida`);
    expect(invalidCat.status).toBe(400);

    const invalidVel = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?velocidade=99`);
    expect(invalidVel.status).toBe(400);
  });

  // Novos Testes das Fases 12, 13 e 14
  it('GET /api/v1/geocodificar?q=Praia Grande -> 200 com >= 1 candidato valido (exige rede)', async () => {
    const res = await request(app).get('/api/v1/geocodificar?q=Praia Grande');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Praia Grande (SP) certamente geocodifica: lista vazia = regressao
    // (ex.: bug do campo 'category' do format=jsonv2 do Nominatim).
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('osm_tipo');
    expect(typeof res.body[0].osm_id).toBe('number');
    expect(res.body[0]).toHaveProperty('nome_exibicao');
    expect(res.body[0]).toHaveProperty('ja_processada');
  }, 20000);

  it('GET /api/v1/geocodificar com consulta inválida -> 400', async () => {
    const res = await request(app).get('/api/v1/geocodificar?q=ab');
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/vitrine com parâmetros inválidos -> 400', async () => {
    const res = await request(app).get('/api/v1/vitrine?osm_tipo=node&osm_id=123');
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/processamentos com categorias inválidas -> 400', async () => {
    const res = await request(app).post('/api/v1/processamentos').send({
      osm_tipo: 'relation',
      osm_id: 298285,
      nome_exibicao: 'São Paulo',
      categorias: ['chave_inexistente']
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
  });

  it('DELETE /api/v1/cidades/999999 -> 404', async () => {
    const res = await request(app).delete('/api/v1/cidades/999999');
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/cidades/999999/reprocessar -> 404', async () => {
    const res = await request(app).post('/api/v1/cidades/999999/reprocessar');
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/cidades/:id/moreno com trabalho_no válido e inválido', async () => {
    const { rows } = await pool.query("SELECT osm_id FROM no WHERE cidade_id = $1 LIMIT 1", [cidadeTestId]);
    if (rows.length > 0) {
      const validNode = rows[0].osm_id;
      const res = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?trabalho_no=${validNode}`);
      expect(res.status).toBe(200);
      expect(res.body.parametros.trabalho_no).toBe(String(validNode));
    }

    const resInvalid = await request(app).get(`/api/v1/cidades/${cidadeTestId}/moreno?trabalho_no=9999999999`);
    expect(resInvalid.status).toBe(400);
  });
});
