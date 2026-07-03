from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent  # PROJETO_15MIN
PASTA_CACHE = RAIZ / "cache_osm"

@dataclass
class Configuracao:
    consulta_osm: str                      # "Praia Grande, São Paulo, Brazil"
    velocidade_kmh: float = 3.0            # conservadora (TCC, seção 1.2.4)
    limiar_minutos: int = 15
    minutos_isocronas: tuple = (5, 10, 15)
    usar_cache_grafo: bool = True
