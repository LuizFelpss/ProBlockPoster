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
│   ├── templates.ts tamanhos de pôster prontos
│   ├── superres.ts  geometria dos retalhos da rede neural
│   ├── deblock.ts   detecção e remoção de artefato de compressão
│   ├── resample.ts  reamostragem Lanczos
│   └── sharpen.ts   máscara de nitidez para impressão
├── services/
│   ├── image.ts     validação, orientação EXIF, preview reduzido
│   ├── enhance.ts   Lanczos e nitidez por folha, com sangria nas emendas
│   ├── superres.ts  ampliação por rede neural (ONNX Runtime, WebGPU)
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

**A sobreposição vira aba de cola, não arte repetida.** A folha avança `sX` mas ocupa
`uW`: a diferença é a faixa que as vizinhas dividem. Se as duas imprimissem arte ali, quem
recortasse pelas marcas de corte e encostasse as folhas veria a imagem repetida em `o` mm
de emenda — letras ganhando traços a mais. Por isso `buildTiles()` deixa esses `o` mm em
branco na borda esquerda de quem não é da primeira coluna e no topo de quem não é da
primeira linha. A arte reparte o pôster sem lacuna nem repetição, e a faixa branca entra
por baixo da vizinha na montagem. A primeira coluna e a primeira linha encostam na borda do
pôster e não sacrificam milímetro nenhum.

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

**Um tamanho pronto guarda lado maior e lado menor, não largura e altura.** A
orientação de um A0 não é propriedade do papel A0, é da imagem que vai ocupá-lo: quem
escolhe A0 com uma foto deitada quer um A0 deitado. Guardar o par fixo obrigaria a
interface a girá-lo depois, que é a mesma decisão tomada num lugar pior. E o atalho não
troca o papel sozinho — quem faz isso é a recomendação de encaixe, que já existia e
aparece logo abaixo com o número de folhas de cada opção. Trocar em silêncio o papel que
o usuário escolheu seria pior que recomendar.

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

**A rede neural é uma opção, não o padrão — e por medição, não por cautela.** Degradando
uma referência e ampliando de volta, o Lanczos ganha em PSNR (27,8 contra 26,7): a rede é
um modelo GAN e troca fidelidade por detalhe inventado. Numa origem *comprimida*, que é o
caso real de quem tem imagem ruim, ela vira a melhor opção: acutância 15,3 contra 14,7 e
blocagem 1,05 contra 1,18 — inclusive em imagens cuja blocagem o detector do app nem
acusa. Em compensação alisa textura fina, e numa imagem já boa isso é perda. O texto na
ficha diz exatamente isso, porque a escolha depende da imagem e quem a conhece é o
usuário.

**A rede exige WebGPU.** O mesmo modelo roda em wasm na CPU, e foi medido: cerca de 37
segundos por megapixel de origem, o que passaria de um minuto por folha. Onde não há
WebGPU a opção aparece desabilitada, dizendo por quê — e não escondida, que faria a
ausência parecer defeito.

**O halo de 34 pixels da rede não foi deduzido, foi medido.** A arquitetura tem 34
convoluções 3 × 3 em sequência, o que dá um campo receptivo de 34 px. A verificação
variou a sangria e comparou o miolo contra a mesma região processada num contexto maior:
com 34 px a diferença é 0, com 32 px é 0,0005 nível, e sem sangria chega a 15,5 níveis —
que seria uma faixa visível exatamente na emenda entre duas folhas.

**Com a rede ligada, o filtro de blocagem sai do caminho.** Num recorte a JPEG de
qualidade 5, com blocagem 2,58 na origem, a rede sozinha entrega 1,08 — o mesmo que
deblock + rede, com a mesma acutância. Ela foi treinada sobre imagens comprimidas; somar
os dois filtros seria pagar duas vezes pelo mesmo resultado.

**Os pesos são versionados, não baixados no build.** São 4,87 MB em `public/modelos/`,
com procedência e sha256 registrados ao lado. Buscá-los de um host de terceiros no build
deixaria o produto refém da disponibilidade alheia, e servi-los da própria origem é o que
mantém o `connect-src 'self'` e a promessa de que a imagem não sai da máquina.

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

**"Baixa qualidade" são dois problemas, e eles pedem coisas opostas.** Imagem pequena é
falta de pixels, e para isso serve a reamostragem. Imagem muito comprimida tem degraus nas
fronteiras dos blocos de 8 × 8 do JPEG, e ampliar só os torna maiores no papel — um bloco
ampliado 3 vezes vira 3 mm de quadrado na parede. `core/deblock.ts` mede a blocagem uma
vez na imagem inteira e, acima do limiar, suaviza só os pixels encostados nas fronteiras,
e só onde os dois lados já estão lisos. Uma borda real que caia sobre a fronteira é
deixada em paz. Medido: blocagem no pôster de 2,67 para 2,25, ao custo de 1,4% de
acutância.

**A medição é uma por imagem, não uma por folha.** Um trecho de céu liso e um trecho com
detalhe mediriam blocagens diferentes, receberiam forças diferentes, e a diferença
apareceria exatamente na emenda entre as duas folhas.

**O alerta de qualidade não mente sobre a melhoria.** O dpi exibido continua saindo dos
pixels originais. Um número que subisse por causa do filtro transformaria o único
indicador confiável do produto em propaganda — e o que o usuário precisa saber é se deve
imprimir menor, não se o filtro está ligado.

**A régua de calibração existe para tornar o critério de aceite testável.** Sem ela não
há como o usuário verificar que imprimiu em escala de 100 % — só medir a régua de 50 mm
da folha de montagem.

## Requisitos

O documento completo está em `../block-poster-requisitos.md`.
