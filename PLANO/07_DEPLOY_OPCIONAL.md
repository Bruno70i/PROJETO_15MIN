# FASE 07 — Deploy em VPS (OPCIONAL)

Executar apenas se o usuário pedir publicação, ou se houver VPS disponível.
O TCC prevê: VPS única com backend + banco + frontend estático (custo-alvo
~R$ 80/mês) e Cloudflare gratuito na frente.

## 7.1 Artefatos a criar (funcionam também localmente)

### `docker\docker-compose.yml`
```yaml
services:
  banco:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${PGPASSWORD}
      POSTGRES_DB: alcancabilidade
    volumes:
      - dados_pg:/var/lib/postgresql/data
      - ../db:/docker-entrypoint-initdb.d:ro   # schema+seed na 1ª subida
    ports: ["5432:5432"]

  api:
    build: ../api
    restart: unless-stopped
    environment:
      PGHOST: banco
      PGPORT: 5432
      PGDATABASE: alcancabilidade
      PGUSER: postgres
      PGPASSWORD: ${PGPASSWORD}
      API_PORT: 3000
    depends_on: [banco]
    ports: ["3000:3000"]

volumes:
  dados_pg:
```

### `api\Dockerfile`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```
(A API já serve `web\` como estático — fase 05 §5.6 — então um único
container atende site + API. Copie `web\` para dentro do build ou monte como
volume; ajuste o caminho do `express.static` para funcionar nos dois
ambientes usando variável `WEB_DIR` com default relativo.)

## 7.2 Roteiro VPS (Ubuntu 22.04+)

1. Acesso: `ssh usuario@ip` (chave, nunca senha em texto).
2. Instalar Docker + compose plugin (script oficial get.docker.com).
3. Clonar/copiar o projeto (sem `.venv`, sem `cache_osm`, sem `.env` local);
   criar `.env` de produção com senha forte.
4. `docker compose -f docker/docker-compose.yml up -d --build`.
5. Processamento de cidades: rodar o CLI Python NA VPS (instalar python3.11
   + venv + requirements) OU rodar localmente no Windows apontando
   `PGHOST=ip_da_vps` (mais simples; exige liberar 5432 só para seu IP no
   firewall — `ufw allow from SEU_IP to any port 5432`).
6. Nginx + TLS: instalar nginx e certbot; proxy 80/443 → 3000;
   `certbot --nginx -d seudominio.com.br`.
7. Cloudflare (plano free): apontar DNS, proxy laranja ligado, SSL Full.
8. Backup diário: cron `pg_dump -Fc alcancabilidade > /backups/alc_$(date +%F).dump`
   com rotação de 7 dias.
9. Segurança mínima: `ufw` (22, 80, 443 apenas — 5432 restrito),
   fail2ban, atualizações automáticas de segurança.

## 7.3 Critérios de aceite

- [ ] `docker compose up` local reproduz o sistema completo do zero
- [ ] (Se VPS) site acessível via HTTPS no domínio; `/api/docs` público
- [ ] (Se VPS) backup automático testado com um restore
- [ ] Custos reais registrados em PROGRESSO.md (comparar com a estimativa
      do TCC: ~R$ 80/mês)
