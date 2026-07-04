import argparse
import time
import sys
import json as _json
import unicodedata
from .config import Configuracao
from .graph import baixar_ou_carregar_grafo
from .services import localizar_servicos
from .reachability import calcular_categoria
from .metrics import agregados_cidade, diagnostico_moreno
from .isochrones import gerar_isocronas
from .db import conectar_db, carregar_categorias, gravar_cidade

def _progresso(pct: int, etapa: str, msg: str):
    print(f'##PROGRESSO## {_json.dumps({"pct": pct, "etapa": etapa, "msg": msg})}', flush=True)

def main():
    parser = argparse.ArgumentParser(description="Plataforma de Alcançabilidade Urbana - Cidade de 15 Minutos")
    parser.add_argument("--place", required=False, help="Nome do local no OpenStreetMap")
    parser.add_argument("--osm-tipo", choices=["relation", "way"], help="Tipo de limite canônico OSM")
    parser.add_argument("--osm-id", type=int, help="ID de limite canônico OSM")
    parser.add_argument("--nome", help="Nome de exibição canônico da cidade")
    parser.add_argument("--atualizar", action="store_true", help="Ignora os caches e rebaixa dados do OSM")
    parser.add_argument("--categorias", help="Chaves de categorias a processar separadas por vírgula")
    parser.add_argument("--velocidade", type=float, default=3.0, help="Velocidade de caminhada (km/h)")
    parser.add_argument("--limiar", type=int, default=15, help="Limiar de alcançabilidade (minutos)")
    parser.add_argument("--sem-cache", action="store_true", help="Força download do grafo sem usar o cache")
    
    args = parser.parse_args()
    
    if not args.place and not (args.osm_tipo and args.osm_id):
        parser.error("Defina --place OU ambos --osm-tipo e --osm-id")
        
    print(f"Iniciando processamento para: {args.nome or args.place}")
    t_start = time.time()
    
    cfg = Configuracao(
        consulta_osm=args.place,
        osm_tipo=args.osm_tipo,
        osm_id=args.osm_id,
        nome_cidade=args.nome,
        velocidade_kmh=args.velocidade,
        limiar_minutos=args.limiar,
        usar_cache_grafo=not args.sem_cache,
        atualizar=args.atualizar
    )
    
    try:
        # Conexão com o banco
        print("Conectando ao banco de dados...")
        conn = conectar_db()
        
        # Carrega categorias do banco
        chaves_list = args.categorias.split(",") if args.categorias else None
        categorias = carregar_categorias(conn, chaves=chaves_list)
        print(f"Carregadas {len(categorias)} categorias de servico do banco de dados.")
        
        # 1. Carrega ou baixa grafo
        t0 = time.time()
        _progresso(5, "grafo", "Baixando ou carregando o grafo da cidade")
        try:
            G = baixar_ou_carregar_grafo(cfg)
        except (ValueError, Exception) as e:
            err_msg = str(e)
            if "Nominatim" in err_msg or "found no results" in err_msg or "No data returned" in err_msg:
                _progresso(0, "erro", "Cidade nao encontrada no OpenStreetMap. Use o formato Cidade, Estado, Pais")
                sys.exit(2)
            else:
                _progresso(0, "erro", f"Erro ao obter o mapa: {err_msg}")
                sys.exit(1)
                
        t_grafo = time.time() - t0
        print(f"[OK] Grafo carregado em {t_grafo:.1f}s. Nos: {len(G.nodes):,}, Arestas: {len(G.edges):,}")
        _progresso(20, "grafo_ok", "Grafo carregado com sucesso")
        
        # 2. Localizar serviços
        t0 = time.time()
        _progresso(25, "servicos", "Localizando servicos no OSM")
        servicos_por_categoria = localizar_servicos(G, cfg, categorias)
        t_servicos = time.time() - t0
        print(f"[OK] Servicos localizados em {t_servicos:.1f}s.")
        _progresso(45, "servicos_ok", "Servicos localizados com sucesso")
        
        # 3. Calcular alcançabilidade por categoria (otimização multi-source)
        t0 = time.time()
        alcancabilidade_por_no = {no_id: {} for no_id in G.nodes}
        
        nos_coords = {}
        for no_id, data in G.nodes(data=True):
            nos_coords[no_id] = (float(data.get("y", 0.0)), float(data.get("x", 0.0)))
            
        N = len(categorias)
        for i, cat in enumerate(categorias):
            cat_id = cat['id']
            cat_rotulo = cat['rotulo']
            
            # Remover acentos para compatibilidade no console do Windows
            cat_rotulo_ascii = "".join(
                c for c in unicodedata.normalize('NFD', cat_rotulo)
                if unicodedata.category(c) != 'Mn'
            )
            pct = 45 + int(35 * i / N)
            _progresso(pct, "calculo", f"Calculando alcancabilidade para {cat_rotulo_ascii}")
            
            servicos = servicos_por_categoria.get(cat_id, [])
            nos_servicos = {s.osm_no_id for s in servicos}
            
            tempos, dono = calcular_categoria(G, nos_servicos)
            
            # Preenche o resultado para cada nó do grafo (se não alcança, tempo=None, dono=None)
            for no_id in G.nodes:
                tempo = tempos.get(no_id, None)
                dono_id = dono.get(no_id, None)
                alcancabilidade_por_no[no_id][cat_id] = (tempo, dono_id)
                
        t_reach = time.time() - t0
        print(f"[OK] Calculo de alcancabilidade (Dijkstra multi-source) concluido em {t_reach:.1f}s.")
        
        # 4. Gerar isócronas
        t0 = time.time()
        _progresso(82, "isocronas", "Gerando isocronas da cidade")
        alc_simples = {no_id: {cat_id: val[0] for cat_id, val in cat_tempos.items()}
                       for no_id, cat_tempos in alcancabilidade_por_no.items()}
        isocronas = gerar_isocronas(cfg, alc_simples, nos_coords)
        t_isocronas = time.time() - t0
        print(f"[OK] Geracao de isocronas concluida em {t_isocronas:.1f}s. Total: {len(isocronas)}")
        
        # 5. Agregados da cidade
        print("Calculando indices agregados...")
        agregados = agregados_cidade(None, list(G.nodes), alc_simples, cfg.limiar_minutos)
        
        # 5.5 Diagnóstico Moreno (Fase 09)
        categorias_presentes = [cat['id'] for cat in categorias if len(servicos_por_categoria.get(cat['id'], [])) > 0]
        categorias_ausentes = [cat['id'] for cat in categorias if len(servicos_por_categoria.get(cat['id'], [])) == 0]
        
        moreno_res = diagnostico_moreno(alcancabilidade_por_no, categorias_presentes, cfg.limiar_minutos, agregados)
        moreno_res['categorias_ausentes'] = categorias_ausentes
        
        # 6. Gravar no banco
        t0 = time.time()
        _progresso(90, "gravacao", "Gravando resultados no banco de dados")
        resultados = {
            'tempo_execucao_s': 0.0,
            'servicos_por_categoria': servicos_por_categoria,
            'alcancabilidade_por_no': alcancabilidade_por_no,
            'isocronas': isocronas,
            'agregados': agregados,
            'moreno': moreno_res,
            # categorias PROCESSADAS (mesmo sem servicos) — vao para cidade_categoria
            'categorias_processadas': [cat['id'] for cat in categorias]
        }
        
        t_calc_total = time.time() - t_start
        resultados['tempo_execucao_s'] = t_calc_total
        
        print("Gravando resultados no banco de dados...")
        cidade_id = gravar_cidade(conn, cfg, G, resultados)
        t_db = time.time() - t0
        print(f"[OK] Dados gravados no banco com sucesso (cidade_id: {cidade_id}) em {t_db:.1f}s.")
        
        # Resumo final
        print("\n" + "="*50)
        print("RESUMO DO PROCESSAMENTO")
        print("="*50)
        print(f"Local: {cfg.consulta_osm or cfg.nome_cidade}")
        print(f"Nos processados: {len(G.nodes):,}")
        print(f"Arestas processadas: {len(G.edges):,}")
        print(f"Tempo total (calculo): {t_calc_total:.1f}s ({t_calc_total/60:.1f} min)")
        
        # Encontra o índice geral no agregado
        geral = next((a for a in agregados if a['categoria_id'] == 0), None)
        if geral:
            tempo_geral = f"{geral['tempo_medio_min']:.2f} min" if geral['tempo_medio_min'] is not None else "N/A"
            print(f"Media Geral de Tempo: {tempo_geral}")
            print(f"Indice de Alcancabilidade Geral: {geral['indice']:.2f}%")
            
        # Imprime Diagnóstico Moreno (Fase 09)
        gargalo_id = moreno_res['categoria_gargalo_id']
        gargalo_rotulo = next((c['rotulo'] for c in categorias if c['id'] == gargalo_id), "N/A")
        gargalo_rotulo_ascii = "".join(
            c for c in unicodedata.normalize('NFD', gargalo_rotulo)
            if unicodedata.category(c) != 'Mn'
        )
        minutos_cidade_str = str(moreno_res['minutos_cidade']) if moreno_res['minutos_cidade'] is not None else "N/A"
        print(f"Diagnostico Moreno: cidade de {minutos_cidade_str} minutos | "
              f"cobertura plena {moreno_res['pct_cobertura_plena']:.2f}% | "
              f"gargalo: {gargalo_rotulo_ascii} | {moreno_res['classificacao']}")
        print("="*50)
        
        _progresso(100, "concluido", "Processamento concluido com sucesso")
        conn.close()
        sys.exit(0)
        
    except Exception as e:
        print(f"[ERRO] Ocorreu um erro no processamento: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        _progresso(0, "erro", f"Erro no processamento: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()

if __name__ == "__main__":
    main()
