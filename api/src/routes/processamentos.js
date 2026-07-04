import express from 'express';
import { spawn } from 'child_process';
import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogoPath = path.resolve(__dirname, '../../../db/catalogo_mestre.json');
const catalogo = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));

export let jobAtual = null;
export function getJobAtual() { return jobAtual; }
let ultimoJob = null;
let logBuffer = []; // Guarda as últimas 50 linhas para debug

export async function iniciarJob({ osm_tipo, osm_id, nome_exibicao, consulta_osm, categorias, atualizar = false }) {
  if (jobAtual !== null) {
    const err = new Error(`Ja existe um processamento em andamento: ${jobAtual.consulta_osm || jobAtual.nome_exibicao}`);
    err.status = 409;
    throw err;
  }

  const isCanonical = !!(osm_tipo && osm_id && nome_exibicao);

  // Inserir as categorias no banco caso não existam ainda
  for (const key of categorias) {
    const catItem = catalogo.find(c => c.chave === key);
    await pool.query(
      `INSERT INTO categoria_servico (chave, rotulo, tag_osm, cor_hex)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chave) DO NOTHING`,
      [catItem.chave, catItem.rotulo, JSON.stringify(catItem.tag), catItem.cor]
    );
  }

  // Inicializa o job
  jobAtual = {
    id: Date.now().toString(),
    consulta_osm: isCanonical ? null : consulta_osm,
    osm_tipo: isCanonical ? osm_tipo : null,
    osm_id: isCanonical ? osm_id : null,
    nome_exibicao: isCanonical ? nome_exibicao : null,
    status: 'rodando',
    pct: 5,
    etapa: 'grafo',
    msg: 'Baixando ou carregando o grafo da cidade',
    iniciadoEm: new Date(),
    terminadoEm: null,
    cidadeId: null,
    codigoSaida: null
  };

  logBuffer = [];

  const pythonBin = process.env.PYTHON_BIN || 'python';
  const algorithmCwd = process.env.ALGORITHM_CWD || process.cwd();

  const args = ['-m', 'algorithm.cli'];
  if (isCanonical) {
    args.push('--osm-tipo', osm_tipo);
    args.push('--osm-id', osm_id.toString());
    args.push('--nome', nome_exibicao);
  } else {
    args.push('--place', consulta_osm);
  }
  args.push('--categorias', categorias.join(','));
  if (atualizar) {
    args.push('--atualizar');
  }

  // Spawna o processo filho do CLI Python
  const filho = spawn(pythonBin, args, {
    cwd: algorithmCwd,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  let stdoutAcumulado = '';

  filho.stdout.on('data', (chunk) => {
    stdoutAcumulado += chunk.toString();
    const linhas = stdoutAcumulado.split(/\r?\n/);
    stdoutAcumulado = linhas.pop() || '';

    for (const linha of linhas) {
      if (linha.trim()) {
        logBuffer.push(`STDOUT: ${linha}`);
        if (logBuffer.length > 50) logBuffer.shift();
      }

      if (linha.startsWith('##PROGRESSO## ')) {
        try {
          const prog = JSON.parse(linha.substring(14));
          if (jobAtual) {
            jobAtual.pct = prog.pct;
            jobAtual.etapa = prog.etapa;
            jobAtual.msg = prog.msg;
          }
        } catch (e) {}
      }
    }
  });

  filho.stderr.on('data', (chunk) => {
    const dataStr = chunk.toString();
    const linhas = dataStr.split(/\r?\n/);
    for (const linha of linhas) {
      if (linha.trim()) {
        logBuffer.push(`STDERR: ${linha}`);
        if (logBuffer.length > 50) logBuffer.shift();
      }
    }
  });

  // Timeout de 30 minutos
  const timeoutLimit = 30 * 60 * 1000;
  const timeoutId = setTimeout(() => {
    if (jobAtual && jobAtual.status === 'rodando') {
      filho.kill();
      jobAtual.status = 'erro';
      jobAtual.msg = 'Tempo limite de processamento excedido (30 minutos).';
      jobAtual.codigoSaida = -9;
      jobAtual.terminadoEm = new Date();
      ultimoJob = { ...jobAtual };
      jobAtual = null;
    }
  }, timeoutLimit);

  filho.on('close', async (code) => {
    clearTimeout(timeoutId);

    if (stdoutAcumulado.startsWith('##PROGRESSO## ')) {
      try {
        const prog = JSON.parse(stdoutAcumulado.substring(14));
        if (jobAtual) {
          jobAtual.pct = prog.pct;
          jobAtual.etapa = prog.etapa;
          jobAtual.msg = prog.msg;
        }
      } catch (e) {}
    }

    if (!jobAtual) return;

    jobAtual.codigoSaida = code;
    jobAtual.terminadoEm = new Date();

    if (code === 0) {
      try {
        let cityQuery = "";
        let queryParams = [];
        if (isCanonical) {
          cityQuery = "SELECT id FROM cidade WHERE osm_limite_tipo = $1 AND osm_limite_id = $2";
          queryParams = [osm_tipo, osm_id];
        } else {
          cityQuery = "SELECT id FROM cidade WHERE consulta_osm = $1";
          queryParams = [consulta_osm];
        }
        const { rows } = await pool.query(cityQuery, queryParams);
        if (rows.length > 0) {
          jobAtual.cidadeId = rows[0].id;
        }
        jobAtual.status = 'concluido';
        jobAtual.pct = 100;
        jobAtual.msg = 'Processamento concluido com sucesso!';
      } catch (dbErr) {
        jobAtual.status = 'erro';
        jobAtual.msg = `Salvo no banco, mas erro ao recuperar ID: ${dbErr.message}`;
      }
    } else {
      jobAtual.status = 'erro';
      if (jobAtual.etapa !== 'erro') {
        jobAtual.msg = 'Falha no processamento. Consulte os logs da API.';
      }
    }

    ultimoJob = { ...jobAtual };
    jobAtual = null;
  });

  return jobAtual;
}

router.post('/', async (req, res, next) => {
  const { consulta_osm, osm_tipo, osm_id, nome_exibicao, categorias } = req.body;

  let isCanonical = false;
  if (osm_tipo && osm_id && nome_exibicao) {
    isCanonical = true;
    if (osm_tipo !== 'relation' && osm_tipo !== 'way') {
      return res.status(400).json({ erro: "osm_tipo deve ser 'relation' ou 'way'.", codigo: 400 });
    }
    if (isNaN(parseInt(osm_id, 10))) {
      return res.status(400).json({ erro: "osm_id deve ser um número.", codigo: 400 });
    }
    if (typeof nome_exibicao !== 'string' || nome_exibicao.trim().length === 0) {
      return res.status(400).json({ erro: "nome_exibicao inválido.", codigo: 400 });
    }
  } else {
    if (typeof consulta_osm !== 'string' || consulta_osm.length < 3 || consulta_osm.length > 120) {
      return res.status(400).json({
        erro: "A consulta deve ser uma string contendo entre 3 e 120 caracteres.",
        codigo: 400
      });
    }
    const safeRegex = /^[\p{L}\p{N}\s,.\-']+$/u;
    if (!safeRegex.test(consulta_osm)) {
      return res.status(400).json({ erro: "A consulta contem caracteres nao permitidos.", codigo: 400 });
    }
    if (!consulta_osm.includes(',')) {
      return res.status(400).json({
        erro: "A consulta deve conter pelo menos uma virgula separando a cidade (Ex.: Cidade, Estado, Pais).",
        codigo: 400
      });
    }
  }

  if (jobAtual !== null) {
    return res.status(409).json({
      erro: `Ja existe um processamento em andamento: ${jobAtual.consulta_osm || jobAtual.nome_exibicao}`,
      job: jobAtual,
      codigo: 409
    });
  }

  // Validação de categorias
  let selectedKeys = [];
  if (categorias) {
    if (!Array.isArray(categorias) || categorias.length === 0 || categorias.length > catalogo.length) {
      const validChaves = catalogo.map(c => c.chave);
      return res.status(400).json({
        erro: "O parâmetro 'categorias' deve ser um array não vazio contendo chaves válidas.",
        chaves_validas: validChaves,
        codigo: 400
      });
    }
    for (const key of categorias) {
      if (!catalogo.find(c => c.chave === key)) {
        const validChaves = catalogo.map(c => c.chave);
        return res.status(400).json({
          erro: `Categoria inválida: ${key}`,
          chaves_validas: validChaves,
          codigo: 400
        });
      }
    }
    selectedKeys = categorias;
  } else {
    selectedKeys = catalogo.filter(c => c.padrao).map(c => c.chave);
  }

  try {
    // Verifica se a cidade já está processada
    if (isCanonical) {
      const { rows } = await pool.query(
        "SELECT id FROM cidade WHERE osm_limite_tipo = $1 AND osm_limite_id = $2",
        [osm_tipo, osm_id]
      );
      if (rows.length > 0) {
        return res.status(200).json({
          ja_processada: true,
          cidade_id: rows[0].id
        });
      }
    } else {
      const { rows } = await pool.query("SELECT id FROM cidade WHERE consulta_osm = $1", [consulta_osm]);
      if (rows.length > 0) {
        return res.status(200).json({
          ja_processada: true,
          cidade_id: rows[0].id
        });
      }
    }

    const job = await iniciarJob({ osm_tipo, osm_id, nome_exibicao, consulta_osm, categorias: selectedKeys });

    res.status(202).json({
      id: job.id,
      status: job.status
    });

  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      erro: error.message || "Erro ao iniciar o job.",
      codigo: status
    });
  }
});

router.get('/atual', (req, res) => {
  res.json({
    job: jobAtual || ultimoJob || null
  });
});

export default router;
