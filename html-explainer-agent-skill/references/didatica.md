# A base didática — o que a evidência sustenta, e com que força

> Este arquivo é o **motivo** das regras duras do `SKILL.md`. Leia quando for decidir *quanto*
> andaime dar, *quando* uma figura ajuda e *quando* ela atrapalha — ou quando quiser saber se uma
> regra é lei ou palpite.
>
> Levantado em 2026-08-22 por uma rodada de pesquisa com verificação adversarial: 29 fontes,
> 140 afirmações extraídas, 25 submetidas a três verificadores independentes com instrução de
> **refutar**, 14 sobreviventes. As que morreram estão listadas no fim — elas importam tanto quanto
> as que ficaram, porque são as que "todo mundo sabe" e ninguém checou.

## Antes de tudo: a calibragem

Duas coisas condicionam **todo** o resto, e nenhuma regra abaixo deve ser aplicada sem elas.

**1. Magnitude é modesta, não milagrosa.** A meta-análise independente do corpus inteiro de Mayer
(Cromley & Chen, 2025, *Educational Research Review* 49:100730 — 92 artigos, 181 estudos, 591
efeitos) fecha em **g = 0,37 global**, abaixo do 0,40 que Hattie usa como régua de intervenção
educacional típica, "significantly moderated by all moderators, including a small decline in effect
size per year". Os números grandes que circulam (d = 1,35 para o princípio multimídia) são
**medianas da Tabela 6 de Mayer (2024)**, majoritariamente de comparações do laboratório do próprio
autor. Use-os como direção, jamais como promessa.

**2. Documento estático é o lado fraco do moderador.** Na meta-meta-análise umbrella (Noetel et al.,
2022, *Review of Educational Research* 92(3):413-454 — 29 revisões, 1.189 estudos, 78.177
participantes), os princípios rendem **g = 0,27 [0,19; 0,35] em mídia auto-ritmada** contra
**g = 0,41 [0,33; 0,49] em mídia ritmada pelo sistema** (p = 0,02). Um HTML que a pessoa lê no
próprio ritmo é auto-ritmado. Espere menos do que a literatura anuncia.

O contrapeso, e ele é forte: **interatividade de elementos foi o moderador mais poderoso de toda a
umbrella** — g = 0,70 em material complexo contra g = 0,20 em material simples (p < 0,001).
Explicação técnica de verdade é material complexo. É exatamente onde essas regras funcionam.

---

## As dez regras, em ordem de força

### R1 — Figura com texto acoplado, nunca prosa pura · FORTE

Todo conceito que **tem estrutura** (partes que se relacionam, um fluxo, estados, uma hierarquia)
nasce como figura, não como parágrafo. O princípio multimídia é o maior da tabela de Mayer
(mediana d = 1,35, 13 testes) e Cromley & Chen relatam "large, consistent effects were found for
**text + diagrams** across factual, inferential, and transfer outcomes" — os três desfechos, o que é
raro.

Não vale o contrário: prosa que *descreve* um diagrama não é um diagrama.

### R2 — Nível do leitor declarado; na dúvida, mais andaime · FORTE

Suporte desenhado para novato não apenas para de ajudar o experiente: **inverte**. Meta-análise
PRISMA de 2025 (Tetzlaff, Simonsmeier, Peters & Brod, *Learning and Instruction* 98:102142 — 60
estudos, 176 efeitos, N = 5.924, sem viés de publicação detectável):

| Leitor | Efeito de assistência alta |
|---|---|
| Conhecimento prévio **baixo** | d = **+0,505** [0,260; 0,750] |
| Conhecimento prévio **alto** | d = **−0,428** [−0,647; −0,209] |
| Diferença | d = 0,971 [0,631; 1,312] |

Os autores concluem que a coisa é assimétrica e recomendam, textualmente: *"the instructional
implication is to rather provide assistance than to withhold it when in doubt"*. Daí a regra de
degradar para **mais** andaime quando o nível é desconhecido ou misto.

Ressalvas que viajam junto: a assimetria é **descritiva** (0,077 SD de diferença, CIs quase
sobrepostos, sem teste formal); heterogeneidade altíssima (I² = 90,9% / 87,6%); em STEM a margem do
lado novato encolhe; e **nenhum estudo incluído é documentação de software** — nem, em lugar
nenhum, o conhecimento prévio foi *autodeclarado*. Um nível que o leitor declara é proxy mais
ruidoso que o medido, o que só reforça errar para mais assistência.

### R3 — Portão de complexidade: conteúdo simples pede pergunta, não exemplo pronto · FORTE

A Teoria da Carga Cognitiva **só vale para material de alta interatividade de elementos**. Sweller,
van Merriënboer & Paas (2019, *Educational Psychology Review* 31:261-292), verbatim: *"low element
interactivity material in which students had to learn mathematical definitions yielded a **reverse**
worked example effect. Students who were required to **generate** an appropriate response learned
more than students who were shown the correct response."* E na Tabela 1: *"cognitive load theory is
only relevant for complex learning."*

Tradução para esta skill: para **definição, glossário, fato isolado, nomenclatura** — pergunte antes
de responder, esconda a resposta atrás de um `<details>`, force a recuperação. O arsenal completo
(exemplo resolvido, diagrama anotado, segmentação) é para o que tem muitas peças interagindo.

Ressalva: a cadeia do efeito reverso é essencialmente de um grupo de pesquisa (Chen/Kalyuga/Sweller,
2015, *JEP* 107(3):689-704), e **não existe medida a priori de interatividade de elementos** — Chen,
Paas & Sweller (2023) ainda tratam isso como problema aberto. O julgamento é seu.

### R4 — Sinalizar o caminho crítico, no texto E na figura · FORTE

Sinalização é o princípio **mais replicado do corpus inteiro**. Schneider, Beege, Nebel & Rey (2018,
*Educational Research Review* 23:1-24 — 103 estudos, N = 12.201): retenção **g+ = 0,53** [0,42; 0,64],
transferência **g+ = 0,33** [0,22; 0,43], e *"cognitive load was significantly reduced"*. Recodificado
na umbrella de Noetel como g = 0,43 [0,35; 0,50] com **k = 209 efeitos — o maior k de qualquer
princípio** (o seguinte, segmentação, tem k = 123). Há evidência de mecanismo, não só de resultado:
as fixações oculares relevantes aumentaram (g = 0,39 [0,09; 0,68], k = 14).

**A ressalva que muda a implementação:** no próprio Schneider, *"text signaling generally improved
retention and transfer to a greater extent than graphic signaling"*. Colorir o nó crítico no Mermaid
é a operacionalização **mais fraca**. A frase adjacente que diz "**o gargalo é este passo aqui**" é a
mais forte. Faça as duas, nessa ordem de importância.

Custo omitido: sinalizar **aumenta** o tempo de leitura. E Noetel alerta: *"consider if a more simple
signal would be less distracting"* — sinalizar tudo é não sinalizar nada.

### R5 — Rótulo curto DENTRO da figura, nunca legenda distante · FORTE (com teto)

Quando a figura está aqui e a explicação dela está três parágrafos abaixo, o leitor gasta memória de
trabalho costurando as duas. Sweller et al. (2019), verbatim: *"Learners must mentally integrate the
two sources of information in order to understand the solution, a process that yields a high
cognitive load and hampers learning. This split-attention effect can be prevented by physically
integrating the diagram and the solution statements, making mental integration superfluous."*
Corroboração meta-analítica: Schroeder & Cenkci (2018), 58 comparações, n = 2.426, **g = 0,63**.

**O teto é real e pouca gente conhece:** proximidade é U-invertido, não monotônica. Schneider et al.
(2019, *Frontiers in Education* 4:86) mediram a condição de proximidade **alta demais** pontuando
significativamente **pior** que a média (transferência t = 2,19, p = 0,03; retenção t = 2,06,
p = 0,04), porque *"high proximity and too-large amounts of information in limited space caused
confusion"*. Ou seja: rótulo curto ancorado no referente, **jamais** um parágrafo enfiado dentro de
um nó do Mermaid.

### R6 — Texto que só redescreve a figura se APAGA, não se embute · MÉDIO

Redundância é o penúltimo colocado da tabela de Mayer: **d = 0,10** em 12 testes, enunciado como
*"people do **not** learn better when printed text is added to graphics and narration"*. Chandler &
Sweller (1991, diagrama de fluxo sanguíneo): quando as duas fontes se bastam sozinhas, *"only
presenting the diagram was superior to presenting both sources of information together"*.

Formulação honesta: duplicar **não compra nada**. A versão forte ("é ativamente nocivo") foi
**reprovada 1-2** na verificação — não use esse argumento.

E o par com R5: só integre no diagrama o texto que **não se sustenta sozinho**. Se o texto é
autossuficiente e a figura também, escolha um.

### R7 — Segmentar em passos com título próprio · MÉDIO (escopo duvidoso)

Rey, Beege, Nebel, Wirzberger, Schmitt & Schneider (2019, *EPR* 31(2):389-419 — 56 investigações, 88
comparações): retenção d = 0,32, transferência d = 0,36, carga cognitiva d = 0,23; e o **chunking
imposto pelo autor** rende mais (retenção d = 0,41, transferência d = 0,35) — que é justamente o que
um gerador consegue fazer.

**Mas:** as 88 comparações são **todas** de mídia transiente (vídeo/animação com play/pause), **zero**
de texto estático; e no subgrupo **auto-ritmado** — a condição do leitor de documento — a carga some
(d = 0,08, p = 0,43) e a retenção fica n.s. (d = 0,19, p = 0,10). Heterogeneidade de I² ≈ 97%, com
22 dos 67 efeitos de retenção **negativos**. Custo: o tempo de estudo aumenta (d = −0,92), a única
estimativa do artigo com viés de publicação detectado.

Segmente mesmo assim — custo baixo, direção plausível — mas **não cite d = 0,32 como se fosse
validado para documento**.

### R8 — Nada decorativo, nada duplicado, nada de escalada visual · FORTE

Três dos quinze princípios de Mayer (2024, Tabela 6) são nulos ou negativos, e ele os enuncia como
achados de que as pessoas **não** aprendem melhor:

| Princípio | Mediana d | Testes |
|---|---|---|
| Redundância (texto + gráfico + narração) | 0,10 | 12 |
| Imagem do apresentador na tela | 0,20 | 7 |
| Imersão 3D/VR vs. 2D | **−0,10** | 9 |

Cromley & Chen fecham: *"Virtual reality showed no significant effects."* Mais rico ≠ melhor.
Ilustração sem função pedagógica é custo com cara de capricho.

### R9 — Progressive disclosure: o experiente PULA o andaime, não fica sem ele · MÉDIO

O corolário construtivo de R2. Sweller et al. (2019) tratam disso como *guidance-fading effect*:
o suporte *"should be faded out and replaced by problems"* conforme a expertise cresce. Num
documento estático não dá para medir expertise — mas dá para deixar o andaime **dobrável**. O novato
abre; o experiente passa direto. Ninguém fica sem.

**Não generalize o fading para tudo.** Para **segmentação** a evidência aponta ao contrário: em Rey
et al., quem tinha conhecimento **alto** ganhou mais (d = 0,73, k = 7) que quem não tinha nenhum
(d = 0,29, k = 33) — achado que os próprios autores desqualificam por k minúsculo, mas que basta
para não sair removendo estrutura de leitor experiente. Para **sinalização** as fontes se
contradizem (Schneider 2018 não acha moderação por conhecimento prévio; Richter et al. 2016 acha).
Faça fading de **exemplo resolvido e passo-a-passo explícito** — onde a reversão está estabelecida —
e deixe sinalização e segmentação em paz.

### R10 — Não prometa ganho · FORTE

Ver "a calibragem", no topo. g = 0,37 global, g = 0,27 em mídia auto-ritmada, declínio anual do
tamanho de efeito, I² de 87% a 97% em quase toda meta-análise citada. Estas regras aumentam a chance
de o leitor entender. Não são garantia, e o documento não deve fingir que são.

---

## O que a rodada NÃO conseguiu sustentar

Honestidade sobre a cobertura, porque metade da pergunta ficou sem lastro. **Nenhuma** afirmação
verificada sobreviveu sobre: Teoria da Codificação Dupla de Paivio em si; **escolha do tipo de
diagrama** por tipo de conteúdo; técnica de Feynman; analogia e *structure-mapping* de Gentner;
concreto-antes-de-abstrato; casos contrastivos e não-exemplos; *curse of knowledge*; jargão no ponto
de uso vs. glossário e carga tolerável de termos novos; Diátaxis, BLUF, pirâmide invertida, plain
language; prática de recuperação e auto-explicação em documento estático; "estilos de aprendizagem"
como mito; e **qualquer** evidência sobre documentação de software ou explicação gerada por LLM.

Isso é **ausência de evidência coletada, não evidência de ausência**. As regras desta skill que
vierem dessas áreas estão marcadas como **CONVENÇÃO** (documentação oficial: Diátaxis, Google,
Mermaid) ou **OFÍCIO** (prática defensável sem número). Nunca as venda como ciência.

E três técnicas populares **falharam na verificação** — não as justifique com números nesta base:

- a meta-análise de *worked examples* de Barbieri et al. (2023, g = 0,48) — **reprovada 0-3**;
- "exemplo correto supera exemplo errado/contrastivo" — **reprovada 0-3**;
- "prompts de auto-explicação junto a worked examples não ajudam" — **reprovada 1-2**.

## Fontes

| # | Fonte | Papel |
|---|---|---|
| 1 | Mayer (2024), *Educational Psychology Review* 36:8, Tabela 6 — [link](https://link.springer.com/article/10.1007/s10648-023-09842-1) | Os 15 princípios e suas medianas |
| 2 | Cromley & Chen (2025), *Educational Research Review* 49:100730 — [link](https://www.sciencedirect.com/science/article/pii/S1747938X25000673) | Meta-análise independente do corpus de Mayer (g = 0,37) |
| 3 | Noetel et al. (2022), *Review of Educational Research* 92(3) — [link](https://journals.sagepub.com/doi/abs/10.3102/00346543211052329) | Umbrella; moderadores de ritmo e de complexidade |
| 4 | Sweller, van Merriënboer & Paas (2019), *EPR* 31:261-292 — [link](https://link.springer.com/article/10.1007/s10648-019-09465-5) | CLT: split-attention, fading, interatividade de elementos |
| 5 | Tetzlaff et al. (2025), *Learning and Instruction* 98:102142 — [link](https://www.sciencedirect.com/science/article/pii/S0959475225000660) | Reversão por expertise, meta-análise PRISMA |
| 6 | Schneider et al. (2018), *Educational Research Review* 23:1-24 — [link](https://www.sciencedirect.com/science/article/abs/pii/S1747938X17300581) | Sinalização |
| 7 | Rey et al. (2019), *EPR* 31(2):389-419 — [link](https://link.springer.com/article/10.1007/s10648-018-9456-4) | Segmentação |
| 8 | Diátaxis — *Explanation* — [link](https://diataxis.fr/explanation/) | CONVENÇÃO: o que é um documento de explicação |
| 9 | Google developer documentation style guide — *jargon* — [link](https://developers.google.com/style/jargon) | CONVENÇÃO: como tratar buzzword |
| 10 | Mermaid — *Diagram Syntax* — [link](https://mermaid.js.org/intro/syntax-reference.html) | CONVENÇÃO: inventário de tipos |

Três fontes tiveram só o abstract lido (paywall): Schneider 2018, Cromley & Chen 2025 e a versão
publicada de Noetel 2022 (lida via manuscrito CC-BY).
