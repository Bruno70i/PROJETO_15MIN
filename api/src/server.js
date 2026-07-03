import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const port = process.env.API_PORT || 3000;

app.listen(port, () => {
  console.log(`[OK] Servidor da API rodando em http://localhost:${port}`);
  console.log(`[OK] Documentacao Swagger disponivel em http://localhost:${port}/api/docs`);
});
