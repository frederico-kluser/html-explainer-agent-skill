# Como escrever o conteúdo

O HTML é o fácil. O que faz o documento prestar é o texto — e a diferença entre uma explicação boa e
um despejo de informação é quase toda decidida antes de escrever a primeira linha.

## Comece pela resposta

A primeira coisa visível — antes da primeira aba — responde a pergunta do título. Sem preâmbulo, sem
"neste documento veremos", sem histórico do projeto.

> ❌ "Este documento apresenta uma análise das opções de cache disponíveis, considerando o contexto
> atual da aplicação e os requisitos levantados junto ao time."
>
> ✅ "**Use o cache em disco.** O de memória perde tudo a cada deploy e o Redis custa R$ 340/mês para
> resolver um problema que você não tem."

Quem precisa do porquê continua lendo. Quem só queria a resposta já foi embora satisfeito — e isso é
sucesso, não falha.

## Uma pergunta por aba

Escreva a pergunta que cada aba responde antes de escrever a aba. Se não sai uma pergunta limpa, a
aba não deveria existir.

- ✅ "Como isso quebra quando o token expira?"
- ❌ "Considerações adicionais"

O rótulo da aba é a versão curta dessa pergunta: `Quando expira`, não `Considerações`.

## Densidade: alta, mas com ar

Documento técnico bom é denso — cada frase carrega informação — e respirável ao mesmo tempo.

- **Parágrafo de 2 a 4 linhas.** Bloco de 10 linhas ninguém lê; a pessoa rola.
- **Uma ideia por parágrafo.** Duas ideias = dois parágrafos.
- **Frase curta para o que importa.** Guarde as longas para o detalhe.
- **Corte o advérbio.** "significativamente mais rápido" → "3× mais rápido", ou nada.
- **Número em vez de adjetivo.** "grande" não é informação; "1,4 GB" é.

## Nunca um bloco de código solto

Todo bloco vem entre duas frases:

1. **Antes:** o que ele faz e por que está aqui.
2. **Depois:** o que esperar do resultado, ou o que olhar nele.

```
Para invalidar só o que mudou, compare o hash em vez da data:

<pre><code class="language-ts">…</code></pre>

Rodando duas vezes seguidas, a segunda não recompila nada — é assim que você sabe que funcionou.
```

Código sem moldura é o leitor tendo que engenharia-reversa a sua intenção.

## Mostre o erro, não só o certo

A parte mais útil de qualquer explicação é a comparação com o jeito errado — porque é o jeito errado
que a pessoa já está fazendo.

```html
<div class="row g-3">
  <div class="col-md-6">
    <div class="small text-danger mb-1"><i class="bi bi-x-lg"></i> Não faça</div>
    <pre><code class="language-js">setTimeout(() =&gt; copy(txt), 0);</code></pre>
    <p class="small text-body-secondary mb-0">Fora do gesto do usuário, o navegador recusa.</p>
  </div>
  <div class="col-md-6">
    <div class="small text-success mb-1"><i class="bi bi-check-lg"></i> Faça</div>
    <pre><code class="language-js">btn.onclick = () =&gt; copy(txt);</code></pre>
    <p class="small text-body-secondary mb-0">Direto no handler do clique.</p>
  </div>
</div>
```

Sempre com o **porquê** embaixo. "Não faça X" sem motivo vira regra decorada e quebrada na primeira
oportunidade.

## Hierarquia de títulos

`<h1>` uma vez, no topo, fora das abas. Dentro de cada painel comece em `<h2>`. Nunca pule nível
(`h2` → `h4`) — leitor de tela navega por essa árvore.

Use a classe para o tamanho, a tag para a estrutura: `<h2 class="h4">` é um h2 de verdade com
aparência menor. Isso mantém a semântica sem inflar o visual.

## Rótulos de aba

- **1 a 3 palavras.** `Armadilhas`, `Como migrar`, `Referência`.
- **Substantivo ou verbo no infinitivo**, consistente entre as abas: não misture `Instalação` com
  `Como configurar`.
- **Concreto.** `Erros comuns` diz mais que `Observações`.
- **Sem numerar** (`1. Visão`, `2. Uso`) — número promete sequência, e aba não é sequência.

## Tamanho

Se um painel passa de ~2 telas, ou ele tem sub-seções com `<h2>` e índice, ou ele é duas abas.
Se um painel cabe em 3 linhas, ele não é aba: é um `alert` na aba vizinha.

Documento inteiro: 3 a 6 abas. Passou disso, você está escrevendo dois documentos.

## O que sempre fica de fora das abas

No topo, visível sem clique:

- o que o documento responde (o `<h1>` e a linha de apoio);
- pré-requisito ("precisa de acesso admin");
- aviso destrutivo ("isso apaga o índice");
- a data/versão a que o conteúdo se refere.

Aviso dentro de aba escondida é aviso que não existe.

## Marque o que envelhece

Todo documento técnico apodrece. Diga **quando** ele foi escrito e **contra qual versão** — no
`badge` do cabeçalho e no rodapé. Sem isso, daqui a seis meses ninguém sabe se ainda vale.

```html
<span class="badge text-bg-secondary">Bootstrap 5.3.8</span>
<span class="badge text-bg-secondary">jul/2026</span>
```

## Antes de entregar, corte

Passe uma vez cortando:

- introdução que só anuncia o que vem depois;
- "é importante notar que", "vale ressaltar", "de forma geral";
- frase que repete o que o código já diz (`// incrementa i` ao lado de `i++`);
- aba que sobrou do template;
- o terceiro alert seguido;
- qualquer parágrafo que você pularia lendo.

O documento fica menor e explica mais. É sempre esse o resultado.
