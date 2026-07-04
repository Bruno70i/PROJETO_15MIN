# FASE 14 — Análise pessoal: minha casa, meu trabalho

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md`. Restrição
> INEGOCIÁVEL desta fase: **nenhuma alteração no algoritmo Python, no
> banco de dados ou no diagnóstico de Moreno** — a métrica oficial
> permanece exatamente como está. Esta fase é 100% frontend + endpoints já
> existentes (`/alcancabilidade` e `/rota`). É independente das fases
> 12/13 (pode ser executada antes ou depois).

## 14.0 Objetivo

O diagnóstico atual mede a CIDADE (métrica territorial de Moreno) e
qualquer PONTO clicado. Falta a pergunta do cidadão: **"a MINHA rotina
cabe em 15 minutos?"** — envolvendo os dois pilares de Moreno que a
métrica territorial não cobre por dados: moradia (onde EU moro) e trabalho
(onde EU trabalho). Esta fase cria a análise pessoal como camada
complementar, com dois marcadores fixáveis no mapa e um cartão próprio.

## 14.1 Interação

1. No painel lateral, novo bloco **"Minha análise"** (visível quando há
   cidade selecionada) com dois botões: `🏠 Definir minha casa` e
   `💼 Definir meu trabalho`.
2. Clicar num botão entra em "modo de captura": o cursor do mapa vira
   crosshair, um aviso flutuante diz "clique no mapa para marcar sua
   casa/trabalho" e o PRÓXIMO clique no mapa define o marcador (esse
   clique NÃO dispara a análise de ponto normal — suprima o handler
   padrão enquanto o modo de captura estiver ativo; tecla Esc cancela).
3. Marcadores persistentes e distintos dos demais: casa = pino com emoji
   🏠 (L.divIcon), trabalho = 💼. Arrastáveis (`draggable: true`) — soltar
   recalcula.
4. Persistência: `localStorage`, chave `analise_pessoal_<cidade_id>`
   (JSON `{casa: {lat, lon}, trabalho: {lat, lon}}`). Ao trocar de cidade,
   carregar os marcadores daquela cidade, se existirem. Botão "limpar"
   remove os dois.

## 14.2 Cálculo (somente APIs existentes)

Com CASA definida:
- `GET /alcancabilidade?cidade_id&lat&lon` da casa (com a velocidade
  selecionada no painel, se a fase 10 estiver ativa) → tempos por
  categoria a partir de casa + `no.osm_id` da casa.

Com CASA e TRABALHO definidos:
- `GET /alcancabilidade` do trabalho → obtém `no.osm_id` do trabalho
  (é o jeito já existente de resolver "coordenada → nó"; não crie endpoint
  novo).
- `GET /rota?cidade_id&de=<no_casa>&para=<no_trabalho>[&velocidade]` →
  tempo e traçado casa→trabalho.
- Desenhar a rota casa→trabalho no mapa com o mesmo padrão visual das
  rotas (casing branco + linha), na cor **#7c3aed** (roxa, distinta das
  categorias), com popup "Casa → Trabalho: N min a pé".

### Veredito pessoal (fórmula fechada)
```
tempo_trabalho   = tempo da rota casa→trabalho (min)
pior_servico     = max(tempo_min das categorias com serviço, a partir de casa)
minutos_rotina   = max(tempo_trabalho, pior_servico)      [se trabalho definido]
                 = pior_servico                            [se só casa definida]
atende           = minutos_rotina <= 15
```
Exibir também qual item definiu o `minutos_rotina` (o trabalho ou qual
serviço). Se casa e trabalho estiverem em cidades processadas diferentes,
ou a rota retornar 404: mostrar "sem caminho a pé calculável entre casa e
trabalho nesta base" e calcular o veredito só com os serviços (explicando
isso no cartão).

## 14.3 Cartão "Minha análise" (layout)

1. Título "Minha análise" + botão limpar.
2. Estado vazio: instrução curta ("defina sua casa para começar").
3. Com dados:
   - Destaque: **"Sua rotina cabe em N minutos"** + selo verde
     (`N ≤ 15`: "Dentro do conceito") ou vermelho ("Fora do conceito").
   - Linha TRABALHO no topo (💼, tempo casa→trabalho, ✅/⚠️) — clicável
     para re-desenhar a rota no mapa.
   - Lista de serviços a partir de casa (mesmo componente visual da
     análise de ponto; reutilize a renderização existente), cada linha
     clicável para traçar a rota casa→serviço (função
     `mostrarCaminhoServico` já existente, passando o nó da casa como
     origem).
   - Rodapé pequeno: "Análise pessoal — não altera o diagnóstico da
     cidade. Seus pontos ficam salvos apenas neste navegador."
4. O cartão convive com os já existentes: ordem no painel = Diagnóstico da
   cidade → Minha análise → (análise de ponto quando houver clique
   normal). O botão "← Diagnóstico da Cidade" existente continua
   funcionando.

## 14.4 Privacidade (registrar no sobre.html e no TCC)

Casa e trabalho NUNCA são enviados para armazenamento no servidor — as
coordenadas só transitam nas consultas GET já existentes (stateless) e
ficam salvas apenas no `localStorage` do navegador do usuário. Acrescente
um parágrafo no `sobre.html` dizendo exatamente isso.

## 14.5 Validação manual

1. Definir casa e trabalho no Guarujá → veredito coerente (conferir na mão:
   o `minutos_rotina` = max exibido nas linhas).
2. Arrastar o marcador da casa → recálculo automático.
3. Recarregar a página → marcadores e análise voltam (localStorage).
4. Trocar para outra cidade → cartão zera (ou carrega os pontos daquela
   cidade); voltar → pontos do Guarujá reaparecem.
5. Definir trabalho do outro lado do estuário (sem ponte caminhável) →
   mensagem de rota indisponível, sem crash.
6. Clique normal no mapa continua funcionando como antes quando NÃO está
   em modo de captura.

## 14.6 Critérios de aceite

- [ ] Zero mudanças em `algorithm/`, `db/schema.sql` e endpoints (somente
      frontend) — `git diff` da fase deve tocar apenas `web\`
- [ ] Marcadores 🏠/💼 fixáveis, arrastáveis e persistentes por cidade
- [ ] Veredito "Sua rotina cabe em N minutos" com a fórmula da 14.2
- [ ] Rota casa→trabalho desenhada em roxo pela malha viária
- [ ] Casos de erro tratados (cidades distintas, rota 404, só casa)
- [ ] Nota de privacidade no cartão e no sobre.html
- [ ] Checklist 14.5 completo; commit; PROGRESSO atualizado
