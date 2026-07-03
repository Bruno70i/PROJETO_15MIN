import express from 'express';
import pool from '../db.js';

const router = express.Router();

async function getCategoriasValidas() {
  const { rows } = await pool.query("SELECT chave FROM categoria_servico WHERE id != 0");
  return rows.map(r => r.chave);
}

// 4. GET /cidades/:id/isocronas - Retorna GeoJSON da isócrona
router.get('/:id/isocronas', async (req, res, next) => {
  const { id } = req.params;
  const { categoria, minutos } = req.query;
  const cidadeId = parseInt(id, 10);
  const minutosVal = parseInt(minutos || '15', 10);
  
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
    
    const query = `
      SELECT geojson
      FROM isocrona i
      JOIN categoria_servico cat ON cat.id = i.categoria_id
      WHERE i.cidade_id = $1 AND cat.chave = $2 AND i.minutos = $3
    `;
    const { rows } = await pool.query(query, [cidadeId, categoria, minutosVal]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        erro: `Isocrona nao encontrada para a categoria '${categoria}' e tempo de ${minutosVal} minutos.`,
        codigo: 404
      });
    }
    
    res.json(rows[0].geojson);
  } catch (error) {
    next(error);
  }
});

export default router;
