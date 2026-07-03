-- =====================================================================
-- Plataforma de Alcançabilidade Urbana (Cidade de 15 Minutos)
-- Schema v1.0 — PostgreSQL 16 (sem PostGIS; geometrias como lat/lon e
-- isócronas como GeoJSON em jsonb)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cidade (
    id              SERIAL PRIMARY KEY,
    nome            TEXT NOT NULL,
    pais            TEXT NOT NULL,
    consulta_osm    TEXT NOT NULL,          -- ex.: 'Praia Grande, São Paulo, Brazil'
    data_calculo    TIMESTAMPTZ NOT NULL DEFAULT now(),
    qtd_nos         INTEGER NOT NULL DEFAULT 0,
    qtd_arestas     INTEGER NOT NULL DEFAULT 0,
    tempo_execucao_s NUMERIC(10,2),
    velocidade_kmh  NUMERIC(4,2) NOT NULL DEFAULT 3.0,
    limiar_minutos  INTEGER NOT NULL DEFAULT 15,
    UNIQUE (consulta_osm)
);

CREATE TABLE IF NOT EXISTS categoria_servico (
    id          SERIAL PRIMARY KEY,
    chave       TEXT NOT NULL UNIQUE,      -- ex.: 'saude'
    rotulo      TEXT NOT NULL,             -- ex.: 'Saúde (hospitais)'
    tag_osm     JSONB NOT NULL,            -- ex.: {"amenity": "hospital"}
    cor_hex     TEXT NOT NULL DEFAULT '#3388ff'  -- cor no mapa
);

CREATE TABLE IF NOT EXISTS no (
    id          BIGSERIAL PRIMARY KEY,
    cidade_id   INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    osm_id      BIGINT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    UNIQUE (cidade_id, osm_id)
);
CREATE INDEX IF NOT EXISTS idx_no_cidade_latlon ON no (cidade_id, lat, lon);

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

CREATE TABLE IF NOT EXISTS indice_cidade (
    cidade_id        INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id     INTEGER REFERENCES categoria_servico(id), -- NULL = geral
    tempo_medio_min  NUMERIC(8,2),
    pct_dentro_limiar NUMERIC(5,2),         -- % de nós com tempo <= limiar
    indice           NUMERIC(5,2),          -- 0 a 100
    PRIMARY KEY (cidade_id, categoria_id)
);

CREATE TABLE IF NOT EXISTS isocrona (
    id           BIGSERIAL PRIMARY KEY,
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
    minutos      INTEGER NOT NULL,          -- 5, 10 ou 15
    geojson      JSONB NOT NULL,            -- MultiPolygon GeoJSON (WGS84)
    UNIQUE (cidade_id, categoria_id, minutos)
);

COMMIT;
