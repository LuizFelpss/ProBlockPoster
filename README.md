# Block Poster

Transforma uma imagem em um pôster de grande formato dividido em folhas A4, A3 ou Carta,
e gera o PDF pronto para imprimir, recortar e montar.

Todo o processamento acontece no navegador. A imagem não é enviada para servidor nenhum.

## Como rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm test         # testes do núcleo de cálculo
npm run build    # build de produção em dist/
```

## Arquitetura

O projeto separa a matemática da interface. Tudo que decide o resultado impresso vive em
`src/core/`, sem dependência de DOM, canvas ou React — é código puro, testado, e é onde
um erro sai caro: um pôster só revela que está errado depois de impresso e recortado.

```
src/
├── core/            matemática da divisão — sem DOM, testada em tests/core/
│   ├── paper.ts     formatos de papel, margem mínima, opções de sobreposição
│   ├── layout.ts    fórmulas do tamanho final e derivação da grade
│   ├── fit.ts       modos Preencher / Ajustar
│   ├── tiles.ts     regiões de origem de cada folha
│   ├── quality.ts   resolução efetiva, largura saudável, limites de canvas
│   ├── resample.ts  reamostragem Lanczos
│   └── sharpen.ts   máscara de nitidez para impressão
├── services/
│   ├── image.ts     validação, orientação EXIF, preview reduzido
│   ├── enhance.ts   Lanczos e nitidez por folha, com sangria nas emendas
│   ├── pdf.ts       montagem do PDF (carregado sob demanda)
│   └── posterPdf.ts escolhe entre worker e thread principal, e entrega o arquivo
├── workers/
│   └── pdf.worker.ts  geração fora da thread principal
└── components/      interface
```

### As fórmulas

Todo o dimensionamento sai daqui, e qualquer divergência entre preview, número exibido e
PDF é defeito:

```
uW = pW - 2m          uH = pH - 2m          área imprimível da folha
sX = uW - o           sY = uH - o           avanço entre folhas vizinhas
W  = c × uW - (c-1)o  H  = r × uH - (r-1)o  pôster montado
```

Onde `pW`/`pH` é a folha já orientada, `m` a margem, `o` a sobreposição e `c`/`r` a grade.

Exemplo em A4 retrato com margem de 5 mm, sobreposição de 10 mm e grade 3 × 4:
**580 × 1118 mm**. Sem descontar margem e sobreposição daria 630 × 1188 mm, que é um
tamanho inatingível na prática.

### Decisões que não são óbvias

**Margem mínima de 5 mm.** Impressoras domésticas têm uma faixa não imprimível de 3 a
6 mm em cada borda. Permitir margem 0 produziria folhas com falhas.

**A proporção da imagem manda na altura — a menos que o usuário assuma o controle.** No
modo padrão ele informa a largura e o número de linhas sai da proporção real da imagem.
No modo por tamanho ele informa os dois eixos, e aí a proporção é dele: é o que permite um
banner de 200 × 42 cm a partir de uma foto comum. A grade nunca estica nada: quando as
proporções não batem, ou se recorta (Preencher) ou sobra papel (Ajustar).

**Qual papel chega mais perto do tamanho pedido não é intuitivo.** Um banner de
200 × 42 cm sai em 7 folhas A3 em paisagem e em 14 folhas A4 em retrato — e a opção de
metade das folhas ainda fica mais perto do alvo. Por isso `melhorEncaixe()` avalia as
seis combinações de papel e orientação e recomenda uma. Entre encaixes cujo desvio difere
em menos de 3 pontos percentuais, vence o que gasta menos papel: ninguém troca 8 folhas
por 40 para ganhar 1% de precisão.

**A largura é arredondada, não elevada.** Como o número de folhas é inteiro, a largura
pedida quase nunca é atingível. Arredondar para cima levaria 60 cm pedidos a 77 cm — o
sistema arredonda para a grade mais próxima e mostra a largura real.

**Nunca existe um canvas do tamanho do pôster.** O Safari limita a área total de um
canvas a cerca de 16,7 milhões de pixels e o Chrome limita cada lado a 65.535 px. Cada
folha é renderizada no seu próprio canvas e descartada em seguida.

**Os tiles vão como JPEG, não PNG.** A 200 dpi um PNG produz arquivos de centenas de MB
e inviabiliza o download no celular.

**A geração roda em um worker, mas o mesmo código roda nos dois lugares.** `pdf.ts`
recebe uma fábrica de superfície de desenho: canvas do DOM na thread principal,
`OffscreenCanvas` dentro do worker. Não há duas implementações para divergirem. Onde não
existe `OffscreenCanvas` ou worker de módulo (Safari < 16.4, Firefox < 114) o fallback
gera o mesmo PDF, só travando a interface entre folhas — medido: a maior pausa da thread
principal cai de 189 ms para 25 ms quando o worker está disponível.

**O zoom do recorte derruba o dpi efetivo, e o aviso acompanha.** Ampliar significa cobrir
o mesmo pôster com menos pixels de origem. O alerta de resolução é calculado sobre a área
realmente usada, então ele reage ao zoom sem nenhum código extra.

**A imagem já era ampliada antes de existir `core/resample.ts`.** Quando a folha sai a
200 dpi e a origem tem 90, o `drawImage` interpola de qualquer jeito. A escolha nunca foi
ampliar ou não, foi com qual filtro — daí Lanczos no lugar do filtro interno do navegador,
mais máscara de nitidez, porque papel e tinta borram e produção gráfica sempre compensou
isso. Ganho medido: acutância de 5,17 para 6,03 numa ampliação de 3,3×, ao custo de
~550 ms por folha. Modesto de propósito: ampliar não recupera detalhe que não foi
capturado.

**Filtrar folha a folha marcaria as emendas.** Convolução perto da borda não encontra os
vizinhos que existiriam na imagem inteira, e a diferença apareceria exatamente onde as
folhas se encontram na parede. Por isso `services/enhance.ts` extrai cada folha com
sangria, filtra e só então descarta a sangria. Verificado: a coluna da emenda fica
idêntica ao render da imagem inteira, contra 37 níveis de diferença sem sangria.

**O alerta de qualidade não mente sobre a melhoria.** O dpi exibido continua saindo dos
pixels originais. Um número que subisse por causa do filtro transformaria o único
indicador confiável do produto em propaganda — e o que o usuário precisa saber é se deve
imprimir menor, não se o filtro está ligado.

**A régua de calibração existe para tornar o critério de aceite testável.** Sem ela não
há como o usuário verificar que imprimiu em escala de 100 % — só medir a régua de 50 mm
da folha de montagem.

## Requisitos

O documento completo está em `../block-poster-requisitos.md`.
