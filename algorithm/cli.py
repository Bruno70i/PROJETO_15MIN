import argparse
import time
import sys
from .config import Configuracao
from .graph import baixar_ou_carregar_grafo
from .services import localizar_servicos
from .reachability import calcular_categoria
from .metrics import agregados_cidade
from .isochrones import gerar_isocronas
from .db import conectar_db, carregar_categorias, gravar_cidade

def main():
    parser = argparse.ArgumentParser(description="Plataforma de Alcancabilidade Urbana - Cidade de 15 Minutos")
    parser.add_argument("--place", required=True, help="Nome do local no OpenStreetMap")
    parser.add_argument("--velocidade", type=float, default=3.0, help="Velocidade de caminhada (km/h)")
    parser.add_argument("--limiar", type=int, default=15, help="Limiar de alcancabilidade (minutos)")
    parser.add_argument("--sem-cache", action="store_true", help="Forca download do grafo sem usar o cache")
    
    args = parser.parse_args()
    
    print(f"Iniciando processamento para: {args.place}")
    t_start = time.time()
    
    cfg = Configuracao(
        consulta_osm=args.place,
        velocidade_kmh=args.velocidade,
        limiar_minutos=args.limiar,
        usar_cache_grafo=not args.sem_cache
    )
    
    try:
        # Conexão com o banco
        print("Conectando ao banco de dados...")
        conn = conectar_db()
        
        # Carrega categorias do banco
        categorias = carregar_categorias(conn)
        print(f"Carregadas {len(categorias)} categorias de servico do banco de dados.")
        
        # 1. Carrega ou baixa grafo
        t0 = time.time()
        G = baixar_ou_carregar_grafo(cfg)
        t_grafo = time.time() - t0
        print(f"[OK] Grafo carregado em {t_grafo:.1f}s. Nos: {len(G.nodes):,}, Arestas: {len(G.edges):,}")
        
        # 2. Localizar serviços
        t0 = time.time()
        servicos_por_categoria = localizar_servicos(G, cfg, categorias)
        t_servicos = time.time() - t0
        print(f"[OK] Servicos localizados em {t_servicos:.1f}s.")
        
        # 3. Calcular alcançabilidade por categoria (otimização multi-source)
        t0 = time.time()
        alcancabilidade_por_no = {no_id: {} for no_id in G.nodes}
        
        nos_coords = {}
        for no_id, data in G.nodes(data=True):
            nos_coords[no_id] = (float(data.get("y", 0.0)), float(data.get("x", 0.0)))
            
        for cat_id in servicos_por_categoria.keys():
            servicos = servicos_por_categoria[cat_id]
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
        alc_simples = {no_id: {cat_id: val[0] for cat_id, val in cat_tempos.items()}
                       for no_id, cat_tempos in alcancabilidade_por_no.items()}
        isocronas = gerar_isocronas(cfg, alc_simples, nos_coords)
        t_isocronas = time.time() - t0
        print(f"[OK] Geracao de isocronas concluida em {t_isocronas:.1f}s. Total: {len(isocronas)}")
        
        # 5. Agregados da cidade
        print("Calculando indices agregados...")
        agregados = agregados_cidade(None, list(G.nodes), alc_simples, cfg.limiar_minutos)
        
        # 6. Gravar no banco
        t0 = time.time()
        resultados = {
            'tempo_execucao_s': 0.0,
            'servicos_por_categoria': servicos_por_categoria,
            'alcancabilidade_por_no': alcancabilidade_por_no,
            'isocronas': isocronas,
            'agregados': agregados
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
        print(f"Local: {cfg.consulta_osm}")
        print(f"Nos processados: {len(G.nodes):,}")
        print(f"Arestas processadas: {len(G.edges):,}")
        print(f"Tempo total (calculo): {t_calc_total:.1f}s ({t_calc_total/60:.1f} min)")
        
        # Encontra o índice geral no agregado
        geral = next((a for a in agregados if a['categoria_id'] == 0), None)
        if geral:
            tempo_geral = f"{geral['tempo_medio_min']:.2f} min" if geral['tempo_medio_min'] is not None else "N/A"
            print(f"Media Geral de Tempo: {tempo_geral}")
            print(f"Indice de Alcancabilidade Geral: {geral['indice']:.2f}%")
        print("="*50)
        
        conn.close()
        sys.exit(0)
        
    except Exception as e:
        print(f"[ERRO] Ocorreu um erro no processamento: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
