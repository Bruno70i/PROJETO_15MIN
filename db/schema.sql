-- =====================================================================
-- Plataforma de Alcançabilidade Urbana (Cidade de 15 Minutos)
-- Schema v1.1 — PostgreSQL 16+ (sem PostGIS; geometrias como lat/lon e
-- isócronas/traçados como GeoJSON em jsonb)
--
-- As tabelas são criadas em ordem de dependência (uma tabela só é criada
-- depois daquelas que ela referencia por chave estrangeira). Todo o script
-- é idempotente (CREATE TABLE IF NOT EXISTS) e transacional.
-- Aplicar com:  psql -d alcancabilidade -f schema.sql
-- =====================================================================

BEGIN;

-- 1) cidade — não depende de ninguém
CREATE TABLE IF NOT EXISTS cidade (
    id               SERIAL PRIMARY KEY,
    nome             TEXT NOT NULL,
    pais             TEXT NOT NULL,
    consulta_osm     TEXT NOT NULL,          -- ex.: 'Praia Grande, São Paulo, Brazil'
    osm_limite_tipo  TEXT,                   -- identidade canônica: 'relation' | 'way'
    osm_limite_id    BIGINT,                 -- id do limite administrativo no OSM
    data_calculo     TIMESTAMPTZ NOT NULL DEFAULT now(),
    qtd_nos          INTEGER NOT NULL DEFAULT 0,
    qtd_arestas      INTEGER NOT NULL DEFAULT 0,
    tempo_execucao_s NUMERIC(10,2),
    velocidade_kmh   NUMERIC(4,2) NOT NULL DEFAULT 3.0,
    limiar_minutos   INTEGER NOT NULL DEFAULT 15,
    UNIQUE (consulta_osm)
);
-- Dedup por identidade canônica (Guarujá "Brasil" == Guarujá "Brazil")
CREATE UNIQUE INDEX IF NOT EXISTS uq_cidade_osm_limite
  ON cidade (osm_limite_tipo, osm_limite_id)
  WHERE osm_limite_id IS NOT NULL;

-- 2) categoria_servico — não depende de ninguém
CREATE TABLE IF NOT EXISTS categoria_servico (
    id          SERIAL PRIMARY KEY,
    chave       TEXT NOT NULL UNIQUE,      -- ex.: 'saude'
    rotulo      TEXT NOT NULL,             -- ex.: 'Saúde (hospitais)'
    tag_osm     JSONB NOT NULL,            -- ex.: {"amenity": "hospital"}
    cor_hex     TEXT NOT NULL DEFAULT '#3388ff'  -- cor no mapa
);

-- 3) cidade_categoria — depende de cidade e categoria_servico
CREATE TABLE IF NOT EXISTS cidade_categoria (
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
    PRIMARY KEY (cidade_id, categoria_id)
);

-- 4) no — depende de cidade
CREATE TABLE IF NOT EXISTS no (
    id          BIGSERIAL PRIMARY KEY,
    cidade_id   INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    osm_id      BIGINT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    UNIQUE (cidade_id, osm_id)
);
CREATE INDEX IF NOT EXISTS idx_no_cidade_latlon ON no (cidade_id, lat, lon);

-- 5) servico — depende de cidade e categoria_servico
CREATE TABLE IF NOT EXISTS servico (
    id           BIGSERIAL PRIMARY KEY,
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
    nome         TEXT,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    osm_no_id    BIGINT NOT NULL            -- nó do grafo mais próximo (osm_id)
);
CREATE INDEX IF NOT EXISTS idx_servico_cidade_cat ON servico (cidade_id, categoria_id);

-- 6) alcancabilidade_no — depende de cidade, categoria_servico e servico
CREATE TABLE IF NOT EXISTS alcancabilidade_no (
    cidade_id     INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    osm_no_id     BIGINT NOT NULL,
    categoria_id  INTEGER NOT NULL REFERENCES categoria_servico(id),
    tempo_min     NUMERIC(8,2),             -- NULL = inalcançável
    dentro_limiar BOOLEAN NOT NULL DEFAULT FALSE,
    servico_id    BIGINT REFERENCES servico(id),  -- serviço mais próximo
    PRIMARY KEY (cidade_id, osm_no_id, categoria_id)
);
CREATE INDEX IF NOT EXISTS idx_alc_cidade_cat ON alcancabilidade_no (cidade_id, categoria_id);

-- 7) indice_cidade — depende de cidade e categoria_servico
CREATE TABLE IF NOT EXISTS indice_cidade (
    cidade_id        INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id     INTEGER REFERENCES categoria_servico(id), -- 0 = índice geral
    tempo_medio_min  NUMERIC(8,2),
    pct_dentro_limiar NUMERIC(5,2),         -- % de nós com tempo <= limiar
    indice           NUMERIC(5,2),          -- 0 a 100
    PRIMARY KEY (cidade_id, categoria_id)
);

-- 8) aresta — depende de cidade (traçado real das vias, usado pelo Dijkstra da API)
CREATE TABLE IF NOT EXISTS aresta (
    id           BIGSERIAL PRIMARY KEY,
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    no_origem    BIGINT NOT NULL,           -- osm_id do nó de origem
    no_destino   BIGINT NOT NULL,           -- osm_id do nó de destino
    tempo_s      NUMERIC(10,2) NOT NULL,    -- tempo de travessia a pé (s)
    geom         JSONB NOT NULL             -- [[lon,lat], ...] traçado real da via
);
CREATE INDEX IF NOT EXISTS idx_aresta_cidade ON aresta (cidade_id);

-- 9) isocrona — depende de cidade e categoria_servico
CREATE TABLE IF NOT EXISTS isocrona (
    id           BIGSERIAL PRIMARY KEY,
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
    minutos      INTEGER NOT NULL,          -- 5, 10 ou 15
    geojson      JSONB NOT NULL,            -- Polygon/MultiPolygon GeoJSON (WGS84)
    UNIQUE (cidade_id, categoria_id, minutos)
);

-- 10) indice_moreno — depende de cidade e categoria_servico
CREATE TABLE IF NOT EXISTS indice_moreno (
    cidade_id             INTEGER PRIMARY KEY REFERENCES cidade(id) ON DELETE CASCADE,
    limiar_minutos        INTEGER NOT NULL,
    pct_cobertura_plena   NUMERIC(5,2) NOT NULL,
    minutos_cidade        INTEGER,                -- NULL se cidade sem nós cobertos
    tempo_pior_medio      NUMERIC(8,2),
    tempo_pior_mediana    NUMERIC(8,2),
    pct_nos_sem_cobertura NUMERIC(5,2) NOT NULL DEFAULT 0,
    atende_conceito       BOOLEAN NOT NULL,
    classificacao         TEXT NOT NULL,
    categoria_gargalo_id  INTEGER REFERENCES categoria_servico(id),
    pct_gargalo           NUMERIC(5,2),
    categorias_ausentes   JSONB NOT NULL DEFAULT '[]'::jsonb,
    distribuicao          JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMIT;
