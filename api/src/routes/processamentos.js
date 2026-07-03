import express from 'express';
import { spawn } from 'child_process';
import pool from '../db.js';

const router = express.Router();

let jobAtual = null;
let ultimoJob = null;
let logBuffer = []; // Guarda as últimas 50 linhas para debug

router.post('/', async (req, res, next) => {
  const { consulta_osm } = req.body;

  if (typeof consulta_osm !== 'string' || consulta_osm.length < 3 || consulta_osm.length > 120) {
    return res.status(400).json({
      erro: "A consulta deve ser uma string contendo entre 3 e 120 caracteres.",
      codigo: 400
    });
  }

  // Regex para permitir letras acentuadas, números, espaços, vírgulas, hifens, pontos e apóstrofos
  const safeRegex = /^[\p{L}\p{N}\s,.\-']+$/u;
  if (!safeRegex.test(consulta_osm)) {
    return res.status(400).json({
      erro: "A consulta contem caracteres nao permitidos.",
      codigo: 400
    });
  }

  if (!consulta_osm.includes(',')) {
    return res.status(400).json({
      erro: "A consulta deve conter pelo menos uma virgula separando a cidade (Ex.: Cidade, Estado, Pais).",
      codigo: 400
    });
  }

  if (jobAtual !== null) {
    return res.status(409).json({
      erro: `Ja existe um processamento em andamento: ${jobAtual.consulta_osm}`,
      job: jobAtual,
      codigo: 409
    });
  }

  try {
    // Verifica se a cidade já está processada no banco de dados
    const checkQuery = "SELECT id FROM cidade WHERE consulta_osm = $1";
    const { rows } = await pool.query(checkQuery, [consulta_osm]);
    if (rows.length > 0) {
      return res.status(200).json({
        ja_processada: true,
        cidade_id: rows[0].id
      });
    }

    // Inicializa o job
    jobAtual = {
      id: Date.now().toString(),
      consulta_osm,
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

    // Spawna o processo filho do CLI Python
    const filho = spawn(pythonBin, ['-m', 'algorithm.cli', '--place', consulta_osm], {
      cwd: algorithmCwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdoutAcumulado = '';

    filho.stdout.on('data', (chunk) => {
      stdoutAcumulado += chunk.toString();
      const linhas = stdoutAcumulado.split(/\r?\n/);
      // Mantém a última linha parcial no acumulador
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
          } catch (e) {
            // Ignora linhas de progresso malformadas
          }
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

      // Processa qualquer resto no acumulador
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

      if (!jobAtual) return; // Caso o timeout já tenha limpado

      jobAtual.codigoSaida = code;
      jobAtual.terminadoEm = new Date();

      if (code === 0) {
        try {
          const cityQuery = "SELECT id FROM cidade WHERE consulta_osm = $1";
          const { rows } = await pool.query(cityQuery, [consulta_osm]);
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

    res.status(202).json({
      id: jobAtual.id,
      consulta_osm: jobAtual.consulta_osm,
      status: jobAtual.status
    });

  } catch (error) {
    jobAtual = null;
    next(error);
  }
});

router.get('/atual', (req, res) => {
  res.json({
    job: jobAtual || ultimoJob || null
  });
});

export default router;
