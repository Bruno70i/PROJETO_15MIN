BEGIN;

INSERT INTO categoria_servico (id, chave, rotulo, tag_osm, cor_hex) VALUES
 (0, 'geral',       'Índice geral',            '{}'::jsonb,                      '#000000'),
 (1, 'saude',       'Saúde (hospitais)',       '{"amenity": "hospital"}',        '#e74c3c'),
 (2, 'farmacia',    'Farmácias',               '{"amenity": "pharmacy"}',        '#9b59b6'),
 (3, 'educacao',    'Educação (escolas)',      '{"amenity": "school"}',          '#3498db'),
 (4, 'mercado',     'Supermercados',           '{"shop": "supermarket"}',        '#27ae60'),
 (5, 'transporte',  'Transporte (rodoviárias)','{"amenity": "bus_station"}',     '#f39c12'),
 (6, 'banco',       'Bancos',                  '{"amenity": "bank"}',            '#16a085'),
 (7, 'combustivel', 'Postos de combustível',   '{"amenity": "fuel"}',            '#7f8c8d'),
 (8, 'lazer',       'Lazer (parques)',         '{"leisure": "park"}',            '#2ecc71')
ON CONFLICT (id) DO NOTHING;

SELECT setval('categoria_servico_id_seq', 100);

COMMIT;
