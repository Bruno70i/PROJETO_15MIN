import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import pool from './db.js';
import cidadesRouter from './routes/cidades.js';
import isocronasRouter from './routes/isocronas.js';
import alcancabilidadeRouter from './routes/alcancabilidade.js';
import rotaRouter from './routes/rota.js';

const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configurações Globais
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.static(process.env.WEB_DIR || path.resolve(__dirname, '../../web')));

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições
  message: { erro: "Limite de requisicoes excedido. Tente novamente mais tarde.", codigo: 429 }
});

if (process.env.NODE_ENV !== 'test') {
  app.use('/api/', limiter);
}

// Swagger UI Docs
try {
  const fileContent = fs.readFileSync(path.resolve(__dirname, '../openapi.yaml'), 'utf8');
  const swaggerDocument = YAML.parse(fileContent);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  console.error("Falha ao carregar openapi.yaml para documentacao do Swagger:", error);
}

// Endpoints básicos da v1
app.get('/api/v1/saude', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1");
    res.json({
      status: "ok",
      banco: rows.length > 0
    });
  } catch (error) {
    res.status(500).json({
      status: "erro",
      banco: false,
      erro: "Sem conexao com o banco de dados"
    });
  }
});

app.get('/api/v1/comparar', async (req, res, next) => {
  const { cidades } = req.query;
  if (!cidades) {
    return res.status(400).json({ erro: "O parametro 'cidades' e obrigatorio (ex.: cidades=1,2)", codigo: 400 });
  }
  
  const ids = cidades.split(',').map(s => parseInt(s.trim(), 10));
  if (ids.some(isNaN)) {
    return res.status(400).json({ erro: "Todos os IDs de cidades devem ser numeros inteiros", codigo: 400 });
  }
  
  if (ids.length > 5) {
    return res.status(400).json({ erro: "Nao e possivel comparar mais de 5 cidades simultaneamente", codigo: 400 });
  }
  
  try {
    const resultados = [];
    for (const cidId of ids) {
      const cityRes = await pool.query("SELECT id, nome, pais, consulta_osm, data_calculo, qtd_nos, limiar_minutos FROM cidade WHERE id = $1", [cidId]);
      if (cityRes.rowCount === 0) {
        return res.status(404).json({ erro: `Cidade com ID ${cidId} nao encontrada`, codigo: 404 });
      }
      const c = cityRes.rows[0];
      
      const indicesRes = await pool.query(`
        SELECT cat.chave, cat.rotulo, cat.cor_hex,
               ic.tempo_medio_min, ic.pct_dentro_limiar, ic.indice
        FROM indice_cidade ic
        JOIN categoria_servico cat ON cat.id = ic.categoria_id
        WHERE ic.cidade_id = $1
        ORDER BY cat.id ASC
      `, [cidId]);
      
      const indices = indicesRes.rows.map(r => ({
        chave: r.chave,
        rotulo: r.rotulo,
        cor_hex: r.cor_hex,
        tempo_medio_min: r.tempo_medio_min !== null ? parseFloat(r.tempo_medio_min) : null,
        pct_dentro_limiar: parseFloat(r.pct_dentro_limiar),
        indice: parseFloat(r.indice)
      }));
      
      resultados.push({
        cidade: {
          id: c.id,
          nome: c.nome,
          pais: c.pais,
          consulta_osm: c.consulta_osm,
          data_calculo: c.data_calculo,
          qtd_nos: c.qtd_nos,
          limiar_minutos: c.limiar_minutos
        },
        indices
      });
    }
    res.json(resultados);
  } catch (error) {
    next(error);
  }
});

// Rotas registradas
app.use('/api/v1/cidades', cidadesRouter);
app.use('/api/v1/cidades', isocronasRouter); // Rota /cidades/:id/isocronas está neste router
app.use('/api/v1/alcancabilidade', alcancabilidadeRouter);
app.use('/api/v1/rota', rotaRouter);

// Handler 404
app.use((req, res, next) => {
  res.status(404).json({ erro: "Rota nao encontrada", codigo: 404 });
});

// Handler de erro global
app.use((err, req, res, next) => {
  console.error("Erro interno da API:", err);
  const status = err.status || 500;
  res.status(status).json({
    erro: err.message || "Erro interno do servidor",
    codigo: status
  });
});

export default app;
