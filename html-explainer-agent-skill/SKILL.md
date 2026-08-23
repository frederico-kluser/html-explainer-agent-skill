---
name: html-explainer-agent-skill
description: >-
  Explicar um assunto para uma pessoa entender de verdade — com DIAGRAMAS, com as buzzwords
  definidas onde aparecem, e com o andaime calibrado pelo nível do leitor. A skill NÃO desenha o
  HTML: ela escreve o BRIEF DIDÁTICO (leitor, afirmação por figura, tipo de diagrama, glossário
  inline, caminho crítico sinalizado, o que dobrar para o experiente pular) e SEMPRE delega a
  renderização e a entrega para a skill plannotator-visual-explainer, que abre o resultado na UI do
  Plannotator — instalando e configurando o Plannotator sozinha, em todos os agent skill dirs, se
  ele faltar. Use ao pedir "explica isso", "me explica direito", "monta um documento", "faz
  um guia/tutorial/comparativo", "documenta essa API/esse fluxo", "desenha como funciona", "faz um
  diagrama disso", "explica pra quem nunca viu". NÃO use para página de produto, app com estado,
  site com build, nem quando o destino é um README/docs de repositório — lá o formato é Markdown.
license: MIT
metadata:
  version: "2.0.0"
  requires: >-
    Plannotator (instalado automaticamente por scripts/plannotator-setup.sh --install), git e curl.
    Node ≥ 18 apenas para a suíte de testes do repositório.
  last-reviewed: "2026-08-22"
---

# Explicar é desenhar, definir e calibrar

> **O que esta skill entrega:** não um arquivo, mas uma **explicação construída sob regras
> didáticas** — que a skill `plannotator-visual-explainer` renderiza e o Plannotator abre para
> anotação. O valor está no BRIEF: decidir o que vira figura, qual figura, o que é sinalizado, quais
> termos são definidos e onde, e quanto andaime o leitor recebe.
>
> **O que ela deixou de fazer:** desenhar HTML. Nada de template Bootstrap, abas, tema escuro
> próprio, linter de HTML ou construtor de prompt. Esse frontend saiu na v2.0.0. Quem compõe o HTML
> é a skill de render; quem entrega é o Plannotator.

## O procedimento — nesta ordem

### 0. Portão: o Plannotator existe?

O script mora ao lado deste arquivo, e **onde** isso é depende do harness — não cravar o caminho:

```bash
for d in ~/.agents/skills ~/.claude/skills "${CLAUDE_CONFIG_DIR:-/nao-existe}/skills" ~/.claude-*/skills; do
  s="$d/html-explainer-agent-skill/scripts/plannotator-setup.sh"
  [ -f "$s" ] && { bash "$s" --install; break; }
done
```

Sai **0** e pode seguir. Sai **1 ou 2**, leia `references/plannotator.md` e resolva — a entrega
depende disso. Idempotente: com tudo pronto não muda nada.

**Se o laço não achar o script** (nada rodou, nenhum código de saída), a skill foi instalada por um
caminho que ele não cobre: procure com `find ~ -name plannotator-setup.sh -path '*html-explainer*' 2>/dev/null`
ou rode `./install.sh` no repositório. Não siga em frente sem o portão — sem Plannotator, o passo 4
não tem para quem delegar.

Este passo instala, quando falta: o binário, a skill `plannotator-visual-explainer`, a skill
`visual-explainer` (nicobailon, que é quem de fato compõe o HTML na rota "todo o resto") e o
**destrave da invocação pelo modelo** — sem ele, a delegação é uma ordem impossível de cumprir.

### 1. Decida o leitor. Sem isso, não comece. (R2)

Uma das quatro etiquetas, e ela governa todo o resto:

| Leitor | O que muda |
|---|---|
| **novato** no assunto | pré-treino de termos antes da figura, exemplo resolvido, passo a passo explícito |
| **intermediário** | figura primeiro, andaime dobrado |
| **experiente** | direto ao mecanismo e às arestas; nada de passo a passo |
| **misto / desconhecido** | **trate como novato** e use dobradura para o experiente pular |

A regra do "misto" não é covardia: a meta-análise de reversão por expertise mede assistência alta
ajudando o novato (d = +0,505) e atrapalhando o experiente (d = −0,428), e os próprios autores
concluem *"rather provide assistance than to withhold it when in doubt"*. O detalhe: **em nenhum
estudo o nível foi autodeclarado** — o que o leitor diz de si é proxy ruidoso. Errar para mais
andaime é a aposta certa.

Se o pedido não diz o nível e dá para perguntar em uma linha, **pergunte**. Se não dá, assuma misto
e escreva isso no BRIEF.

### 2. Passe o portão de complexidade. (R3)

O assunto tem **muitas peças que só fazem sentido juntas** (protocolo, arquitetura, algoritmo,
migração), ou é **fato/definição/nomenclatura**?

- **Muitas peças** → arsenal completo: figura, exemplo resolvido, segmentação, sinalização.
- **Fato ou definição** → o arsenal **inverte**. Pergunte antes de responder, esconda a resposta
  atrás de um `<details>`, force a recuperação. Sweller et al. mediram material definicional
  produzindo um *reverse worked example effect*: quem teve de gerar a resposta aprendeu mais que
  quem a viu pronta.

Não gaste diagrama em conteúdo simples — ali ele é ornamento.

### 3. Escreva o BRIEF DIDÁTICO.

É o artefato desta skill. Markdown, num arquivo temporário, com **exatamente** estas seções:

```markdown
# <título: a pergunta que o documento responde>

## Resposta em uma frase
<a conclusão, antes de qualquer contexto — quem só queria isso já pode ir embora>

## Leitor
nível: novato | intermediário | experiente | misto
já sabe: <o que se pode assumir>
não sabe: <o que precisa ser construído>

## Portão de complexidade
alta interatividade | baixa (definicional → gerar antes de mostrar)

## Buzzwords
| Termo | Primeira aparição | Definição (≤20 palavras) |
|---|---|---|

## Figuras
### Figura 1 — <a AFIRMAÇÃO, uma frase; vira a legenda>
tipo: flowchart TD | sequenceDiagram | stateDiagram-v2 | erDiagram | …
nós: <lista>
arestas: <origem → destino : RÓTULO> (toda aresta tem rótulo)
sinalizar: <o nó/caminho crítico> + <a frase de texto que aponta para ele>

## Segmentos
1. <passo com título próprio>
2. …

## Dobrado (o experiente pula)
- <o que vai em <details>: derivação, passo a passo, exemplo resolvido>

## Fora
- <o que foi cortado por decorativo, duplicado ou redundante>
```

Regras que o BRIEF tem de satisfazer antes de sair:

1. **Toda estrutura vira figura** (R1). Conceito com partes que se relacionam nasce desenhado. Prosa
   descrevendo um diagrama não é um diagrama.
2. **Uma figura, uma afirmação.** Se a frase da legenda não sai, a figura não existe.
3. **Toda aresta tem rótulo.** Seta sem rótulo diz "tem alguma relação" — o leitor já supunha.
4. **Sinalize o crítico duas vezes** (R4): na figura *e* no texto. O texto sinaliza mais forte — no
   próprio Schneider et al., *"text signaling generally improved retention and transfer to a greater
   extent than graphic signaling"*. Sinalizar tudo é não sinalizar nada.
5. **Rótulo curto dentro da figura** (R5), nunca legenda distante — e nunca parágrafo dentro do nó:
   proximidade demais mede **pior** que proximidade média.
6. **Toda buzzword definida na primeira aparição** — a tabela é fechada, sem "definir conforme
   necessário". Protocolo em `references/buzzwords.md`.
7. **Segmentos com título próprio** (R7), não um muro de texto.
8. **Nada decorativo, nada duplicado** (R6, R8). Texto que só redescreve a figura se **apaga**, não
   se embute.
9. **Andaime dobrado, nunca omitido** (R9).

### 4. Delegue a renderização. Sempre.

Invoque a skill **`plannotator-visual-explainer`**, passando o BRIEF e o caminho de saída. Ela
roteia: plano/proposta e PR têm estrutura prescritiva própria; **explicação** cai na rota "todo o
resto", que compõe com a `visual-explainer` aplicando os tokens de tema do Plannotator.

**Não escreva o HTML na mão.** Se a skill de render não aparecer como invocável, o problema é o
passo 0 — volte e conserte, não contorne.

### 5. Entregue pela UI do Plannotator.

```bash
plannotator annotate <arquivo.html>            # explicação: informativo
plannotator annotate <arquivo.md> --gate       # plano/proposta: aprovar ou negar
```

Nunca `xdg-open`, nunca `open`. A UI é o canal: é onde a pessoa anota, e a anotação volta como
feedback para você tratar.

## Regras duras

1. **Renderização é delegada. Sempre.** Esta skill não emite HTML. Se você se pegou escrevendo
   `<div>`, parou de seguir a skill.
2. **Sem nível de leitor declarado, não há explicação** — há despejo de informação.
3. **Toda buzzword declarada é definida onde aparece.** É o gate que esta skill existe para não
   falhar.
4. **Toda figura carrega uma afirmação** na legenda, e **toda aresta carrega um rótulo**.
5. **Mermaid é gate duro:** todo diagrama renderiza nas paletas clara **e** escura antes de a UI
   abrir **e tem de ser LEGÍVEL nas duas** — contraste mínimo entre texto e fundo de cada item, e
   nenhum item com texto ≈ fundo (fundo escuro + texto escuro/claro demais é ilegível). `Syntax
   error in text`, SVG vazio ou `aria-roledescription="error"` = não entregável, e um item preto
   com texto quase transparente também.
6. **A resposta vem antes do contexto.** A primeira coisa visível responde o título.
7. **Não prometa ganho pedagógico** (R10). A base fecha em g = 0,37 global e cai para g = 0,27 em
   mídia auto-ritmada — que é o caso de um documento que a pessoa lê no próprio ritmo.
8. **Nada decorativo.** Três dos quinze princípios de Mayer são nulos ou negativos: redundância
   d = 0,10, imagem do apresentador d = 0,20, imersão 3D/VR d = **−0,10**. Mais rico não é melhor.
9. **Marque o que envelhece** — data e versão contra a qual o conteúdo vale.
10. **Distinga lastro de ofício.** Regra com número vem de `didatica.md`; regra sem número é
    convenção ou ofício, e não deve ser vendida como ciência.

## Quando NÃO usar esta skill

- O destino é `README.md`, `docs/` ou wiki → lá o formato esperado é Markdown.
- É página de produto, landing, app com estado, site com build → outro problema, outra ferramenta.
- É um plano de implementação para aprovar → invoque `plannotator-visual-explainer` direto, na rota
  de plano, com `--gate`. Esta skill é sobre **entender**, não sobre **aprovar**.
- É uma resposta de duas frases → responda em duas frases.

## Fora do básico

| Preciso de… | Leia |
|---|---|
| Por que cada regra existe, com número, ressalva e fonte | `references/didatica.md` |
| Que figura para que conteúdo; invariantes de Mermaid; o gate de renderização | `references/diagramas.md` |
| Como definir jargão, sigla e palavra vaga — e onde | `references/buzzwords.md` |
| Plannotator ausente, travado, quebrado; instalar em todos os agent skill dirs; segurança | `references/plannotator.md` |

## Antes de entregar — checklist

- [ ] `plannotator-setup.sh` saiu 0.
- [ ] O BRIEF tem nível de leitor declarado e portão de complexidade decidido.
- [ ] Toda buzzword da tabela está definida na **primeira** ocorrência no documento final — e
      definida **uma vez só**.
- [ ] Toda figura tem legenda com uma afirmação; toda aresta tem rótulo.
- [ ] O caminho crítico está sinalizado na figura **e** apontado por uma frase no texto.
- [ ] Todo diagrama renderizou **e** é legível nas duas paletas, sem exceção, sem SVG vazio e sem
      item preto com texto transparente.
- [ ] O andaime do novato está dobrável, não ausente.
- [ ] A primeira tela responde o título sozinha.
- [ ] Nada de decorativo, nada de duplicado, nada de "é importante notar que".
- [ ] Foi entregue por `plannotator annotate`, e as anotações que voltaram foram tratadas.
