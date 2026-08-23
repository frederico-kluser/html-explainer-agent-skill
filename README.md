# html-explainer-agent-skill

Uma [Agent Skill](https://code.claude.com/docs/en/skills) que faz um agente de código **explicar
de verdade**: com diagramas, com as buzzwords definidas onde aparecem, e com o andaime calibrado
pelo nível de quem vai ler.

A skill **não desenha HTML**. Ela escreve o **BRIEF DIDÁTICO** e delega a renderização e a entrega
para a skill [`plannotator-visual-explainer`](https://github.com/backnotprop/plannotator), que abre
o resultado na UI de anotação do [Plannotator](https://plannotator.ai) — onde a pessoa lê, anota, e
a anotação volta para o agente.

> **v2.0.0 — mudança de rumo.** A v1 era um gerador de HTML: template Bootstrap, abas, tema escuro,
> linter, construtor de prompt. Isso saiu inteiro. O que ficou — e cresceu — é a parte que decide
> **o que** explicar, **como** desenhar e **quanto** andaime dar. Quem compõe o HTML agora é a skill
> de render; quem entrega é o Plannotator.

**[▶ Veja a saída da skill](https://frederico-kluser.github.io/html-explainer-agent-skill/EXPLAINER.html)**
— `EXPLAINER.html` foi gerado pela própria skill, seguindo o próprio procedimento, e explica esta
mudança. Cinco figuras, cada uma com uma afirmação na legenda; as buzzwords definidas onde
aparecem; o andaime dobrado para quem já sabe pular. Passou no gate de renderização nas paletas
clara e escura.

## O problema que ela resolve

Um agente que "explica" costuma despejar prosa: parágrafos sobre um fluxo que caberia num
diagrama, termos técnicos usados sem definição, e o mesmo nível de detalhe para quem nunca viu o
assunto e para quem o mantém há três anos.

Esta skill obriga três decisões antes da primeira linha:

1. **Quem lê** — novato, intermediário, experiente ou misto. Governa todo o resto.
2. **O assunto é complexo ou definicional** — porque as regras se **invertem** entre os dois.
3. **O que vira figura, e qual figura** — com a afirmação da legenda escrita antes do desenho.

## O que a skill entrega

| | |
|---|---|
| **BRIEF DIDÁTICO** | O artefato: leitor, portão de complexidade, tabela fechada de buzzwords, uma figura por afirmação com rótulo em toda aresta, caminho crítico sinalizado, andaime dobrável. |
| **Base didática citada** | `references/didatica.md` — 10 regras, cada uma com número, ressalva e fonte. E a lista honesta do que **não** tem lastro. |
| **Escolha de figura** | `references/diagramas.md` — de tipo de conteúdo para tipo de diagrama, invariantes de Mermaid, o gate de renderização nas duas paletas. |
| **Protocolo de buzzword** | `references/buzzwords.md` — o que conta como jargão, as três formas de definir, e o gate de cobertura. |
| **Setup do Plannotator** | `scripts/plannotator-setup.sh` — instala binário, skill de render, skill de composição e **destrava a invocação pelo modelo**, em todos os agent skill dirs. Idempotente. |

## Instalação

```bash
git clone https://github.com/frederico-kluser/html-explainer-agent-skill.git
cd html-explainer-agent-skill
./install.sh
```

O instalador faz duas coisas:

1. Cria `~/.agents/skills` (o canônico, e o único diretório que ele cria) e um **symlink** da skill
   em cada agent skill dir que **já existir**. A lista é descoberta, não escrita à mão:
   `~/.agents/skills`, `~/.claude/skills`, `$CLAUDE_CONFIG_DIR/skills`, **todo** `~/.claude-*/skills`
   presente (é assim que o harness **dsh** e qualquer perfil extra entram sozinhos), mais Codex,
   Copilot, OpenCode, Gemini CLI, Cursor e Kiro. Não copia: editar o `SKILL.md` aqui vale na hora,
   em todos. Diretório que não existe é pulado — não inventamos árvore de agente que ninguém usa.
2. Roda `plannotator-setup.sh --install` — **o Plannotator não é opcional**, é quem entrega. O
   binário vem do instalador oficial em modo `--minimal`: só o executável, sem escrever hook ou
   configuração em nenhum harness.

```bash
./install.sh --check           # relata, não escreve
./install.sh --no-plannotator  # só os links
./install.sh --uninstall       # remove os links (nunca toca em diretório real)
```

A descoberta vive em `html-explainer-agent-skill/scripts/agent-dirs.sh` — **fonte única**, lida
pelo `install.sh` e pelo `plannotator-setup.sh`. Um diretório fora do padrão entra por
`HX_EXTRA_AGENT_DIRS` (separado por `:`).

O `install.sh` **propaga o veredito**: sai diferente de 0 se pulou algum link ou se o setup do
Plannotator não completou, para que `./install.sh && algo` não minta em CI.

## O Plannotator

```bash
bash html-explainer-agent-skill/scripts/plannotator-setup.sh            # relata
bash html-explainer-agent-skill/scripts/plannotator-setup.sh --install  # instala/repara
bash html-explainer-agent-skill/scripts/plannotator-setup.sh --json     # para máquina
```

Exit: **0** pronto · **1** falta algo mas dá para instalar · **2** falta algo e não dá.

Quatro peças, nenhuma sobra: o **binário**, a skill **`plannotator-visual-explainer`**, a skill
**`visual-explainer`** (nicobailon, quem de fato compõe o HTML) e o **destrave** — a skill de render
chega com `disable-model-invocation: true` e, travada, a delegação vira uma ordem impossível de
cumprir.

Três coisas que você deveria saber antes de rodar, e que estão detalhadas em
`references/plannotator.md`:

- **o binário vem de `curl | bash`** (o instalador oficial confere o SHA256; há caminho manual se a
  sua política não aceita);
- **o destrave torna uma skill de terceiro invocável pelo modelo** nos seus agentes — é o preço de a
  delegação funcionar sem você pedir;
- **`visual-explainer` é clonada de `main`, sem pin** — trave numa revisão auditada com `HX_VE_REF`.

Toda cópia instalada leva um `.installed-by-html-explainer`, e o `--uninstall` só remove o que tem
essa marca: uma instalação sua, feita por outro caminho e editada à mão, sobrevive.

## A base didática, em uma tela

Levantada em 2026-08-22 por uma rodada de pesquisa com **verificação adversarial**: 29 fontes, 140
afirmações extraídas, 25 submetidas a três verificadores instruídos a **refutar**, 14 sobreviventes.

| Regra | Força | Ancora em |
|---|---|---|
| Figura + texto, nunca prosa pura | forte | princípio multimídia; "large, consistent effects for text + diagrams" |
| Nível do leitor declarado; na dúvida, mais andaime | forte | reversão por expertise: novato d = +0,505 · experiente d = −0,428 |
| Conteúdo definicional pede pergunta, não exemplo pronto | forte | *reverse worked example effect* em baixa interatividade de elementos |
| Sinalizar o crítico — no texto **e** na figura | forte | g+ = 0,53 retenção · k = 209, o maior do corpus |
| Rótulo curto dentro da figura | forte (com teto) | split-attention g = 0,63; proximidade é U-invertido |
| Texto que redescreve a figura se apaga | médio | redundância d = 0,10 |
| Segmentar com título próprio | médio (escopo duvidoso) | d = 0,32/0,36 — mas medido só em mídia transiente |
| Nada decorativo | forte | imagem d = 0,20 · imersão 3D/VR d = **−0,10** |
| Andaime dobrado, nunca omitido | médio | *guidance-fading* |
| Não prometer ganho | forte | g = 0,37 global; **0,27** em mídia auto-ritmada |

A calibragem que atravessa todas: documento estático auto-ritmado é o **lado fraco** do moderador de
ritmo. O contrapeso é que explicação técnica é material de alta interatividade de elementos — o
moderador mais forte de toda a literatura (g = 0,70 contra 0,20).

**Metade da pergunta ficou sem lastro** e está marcada como tal: escolha do tipo de diagrama,
Feynman, analogia/*structure-mapping*, *curse of knowledge*, jargão inline vs. glossário, prática de
recuperação em documento estático, e qualquer evidência sobre explicação gerada por LLM. As regras
que vêm dessas áreas aparecem como **CONVENÇÃO** (Diátaxis, Google, Mermaid) ou **OFÍCIO**, nunca
como ciência. Fontes e ressalvas completas em `references/didatica.md`.

## Testes

```bash
npm test          # node --test, sem rede, sem tocar no $HOME de verdade
```

Vinte e dois casos, nenhum tocando a rede nem o `$HOME` de verdade: onde o script baixaria, os
testes apontam `HX_INSTALL_URL`, `HX_PLANNOTATOR_REPO` e `HX_VE_REPO` para um `file://` — é assim
que `fetch_skill` e `install_bin`, os dois únicos caminhos que baixam e dão `rm -rf`, ficam
cobertos. O ambiente é montado por allowlist, para que um `HX_*` exportado no shell de quem roda
não vire um verde falso.

Cobrem: destrave do frontmatter, espalhamento por symlink, idempotência observável, preservação de
diretório real **e** de symlink apontando para um fork, recusa de sobrescrever cópia sem a marca de
autoria, desinstalação que só remove o que instalou, os três vereditos (0/1/2), o estado
`quebrado`, `--help` inteiro, e a regressão do `install.sh` numa máquina sem `~/.agents/skills`.
Node ≥ 18.20.8.

## Licença

MIT.
