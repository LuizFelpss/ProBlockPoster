# realesr-general-x4v3.onnx

Rede de super-resolução 4× usada pela opção "Ampliar com rede neural" (item 14.1.4 dos
requisitos). Fica versionada aqui, e não é baixada de terceiros no build, porque o
comportamento do produto não deve depender da disponibilidade de um host alheio.

| | |
|---|---|
| Arquitetura | SRVGGNetCompact — 34 convoluções 3 × 3, 64 canais, PixelShuffle 4× |
| Parâmetros | ~1,2 M (4,87 MB em fp32) |
| Entrada | `input` `[1, 3, altura, largura]`, NCHW, RGB, float32 em [0,1] |
| Saída | `output` `[1, 3, 4·altura, 4·largura]`, sem clamp dentro do grafo |
| Opset | 17 |
| sha256 do arquivo | `1940a93ee08283a0a7286183186357b1688fe9fa8ede74604b424586aaddf112` |

## Origem

Exportado para ONNX a partir dos pesos oficiais `realesr-general-x4v3.pth` do release
v0.2.5.0 do [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (Xintao Wang et al.),
redistribuído em
<https://huggingface.co/CoderViking/realesr-general-x4v3-onnx>.

Licença: **BSD-3-Clause**, a mesma do Real-ESRGAN.

## O que foi conferido aqui, e não aceito do descritivo de origem

- O arquivo carrega no ONNX Runtime e uma entrada 64 × 64 produz saída 256 × 256.
- A saída não é limitada a [0,1] dentro do grafo (medido: −0,227 a 1,230), então o
  consumidor precisa fazer o clamp — `services/superres.ts` faz.
- **O raio do campo receptivo é de 34 pixels de origem**, medido variando a sangria e
  comparando o miolo da saída contra a mesma região processada dentro de um contexto
  maior: 34 px dá diferença exatamente 0; 32 px dá 0,0005 nível; sem sangria dá 15,5
  níveis, que seria uma faixa visível na emenda entre duas folhas. É desse número que sai
  `HALO_DA_REDE`.
