# Catálogo de imagens — e-mail, botões e ícones (150 peças em 15 lotes)

Galeria de revisão: `public/ui/preview.html` (abra no navegador; caminhos relativos).

| Família | Peças | Onde |
| --- | --- | --- |
| E-mail (cabeçalhos, rodapés, faixas, assinaturas) | 50 | `public/email/` |
| Botões (superfícies de interface) | 20 | `public/ui/botoes/` |
| Ícones (serviço, operação, navegação, reverso, ação, marca) | 80 + derivados 64 px | `public/ui/icones/` |
| Logotipo e peças de marca (recortes do arquivo real) | 6 + 10 | `public/brand/logo/`, `public/ui/icones/marca/` |

## Regras de marca aplicadas a todas as peças

- O logotipo **nunca** é gerado por IA: as peças usam os recortes reais do arquivo
  `public/brand/454751406_1061413479159366_4672298606281258831_n.jpg`, extraídos para
  `public/brand/logo/` (logo, escudo e texto; versões marinho e reversa).
- Fundos fotográficos são ilustrações conceituais (não são fotos de instalações, clientes ou
  funcionários reais) — ver `docs/referencias-marca.md`. A viatura aparece sem placa, marca ou
  identificação legível.
- Botões e ícones são **sem texto embutido**: o rótulo é escrito em HTML/CSS, o que preserva
  tradução, acessibilidade, foco de teclado e estado desabilitado.
- Contatos, redes sociais e dados legais (razão social, CNPJ, endereço) **não** são desenhados
  nas imagens de e-mail: ficam no HTML, com rótulos acessíveis, e podem ser atualizados.
- Paleta amostrada no logotipo: navy `#0d2236`, navy claro `#1e3c5c`, dourado `#c4a56a`,
  dourado claro `#e2c78f`, dourado escuro `#9c7e4a`. Cores de estado (azul, verde, âmbar,
  vermelho, cinza) calibradas para contraste AA com rótulo branco no CSS.

## Padrões técnicos

- **E-mail**: JPEG (`quality 86–88`, `subsampling=0`, progressivo desligado) com fundo opaco, para
  máxima compatibilidade entre clientes. Cabeçalhos 1200×200 ou 1200×400, rodapés 1200×160 ou
  1200×300, faixas 1200×40/60/90, assinaturas 640×180. Largura pensada para exibição a 600 px em 2x.
- **Botões**: PNG RGBA (480×112 padrão; CTA 600×140; chip 320×84; barra 1200×108) desenhado com
  superamostragem 4x, anel dourado opcional, sombra própria quando “flutuante” e variantes
  translúcidas para uso sobre foto.
- **Ícones**: PNG RGBA 256×256 (derivados 64×64 para menus e atalhos), traço uniforme, glifo
  centralizado com 10% de folga, versões marinho (fundo claro), branco (fundo escuro) e dourado.
- **Marca**: escudo, monograma GS (Cinzel, OFL) e medalhão (disco marinho + anel dourado + escudo
  branco), mais favicon 64 px.

## Lotes

| Lote | Conteúdo | Arquivos | Saída |
| --- | --- | --- | --- |
| 01 | 5 cabeçalhos (1200×400) + 5 rodapés (1200×300) de e-mail | 10 | `public/email/cabecalhos/`, `public/email/rodapes/` |
| 02 | 10 cabeçalhos alternativos (espelhados, split, selo, tarja, malha) | 10 | `public/email/cabecalhos/` |
| 03 | 10 rodapés alternativos (glifos de contato, selo, marcos, tarja, legal) | 10 | `public/email/rodapes/` |
| 04 | 10 cabeçalhos compactos (1200×200) para respostas e notificações | 10 | `public/email/cabecalhos/` |
| 05 | 2 rodapés compactos + 4 faixas/divisores + 4 assinaturas | 10 | `public/email/{rodapes,faixas,assinaturas}/` |
| 06 | 10 botões institucionais (primário, secundário, dourado, vidro, CTA, barra, chip) | 10 | `public/ui/botoes/` |
| 07 | 10 botões de estado e ação (sucesso, aviso, erro, destrutivo, fantasma, desabilitado, carregando) | 10 | `public/ui/botoes/` |
| 08 | 10 ícones de serviço (traço marinho, 256 px) | 20 | `public/ui/icones/servicos/` |
| 09 | 10 ícones de operação e sistema (traço marinho) | 20 | `public/ui/icones/operacao/` |
| 10 | 10 ícones de navegação (traço marinho) | 20 | `public/ui/icones/navegacao/` |
| 11 | 10 ícones de serviço — reverso (branco) | 20 | `public/ui/icones/servicos-reverso/` |
| 12 | 10 ícones de operação — reverso (branco) | 20 | `public/ui/icones/operacao-reverso/` |
| 13 | 10 ícones de navegação — reverso (branco) | 20 | `public/ui/icones/navegacao-reverso/` |
| 14 | 10 peças de marca (escudos, monogramas, medalhões, favicon) | 10 | `public/ui/icones/marca/` |
| 15 | 10 ícones de ação e status (busca, filtro, editar, excluir, imprimir, compartilhar, sino, baixar, atualizar, expandir) | 20 | `public/ui/icones/acoes/` |

Os lotes de ícones gravam o arquivo principal de 256 px e o derivado de 64 px para menus e atalhos
(por isso cada lote aparece com 20 arquivos). O total de peças principais é 150.

## Ícones por família

- **Serviço**: portaria, ronda, CFTV, alarme, monitoramento, escolta, controle de acesso, zeladoria,
  limpeza, jardinagem.
- **Operação**: ocorrência, escala, ponto, checklist, chaves, crachá, relatório, contrato, vistoria,
  comunicação.
- **Navegação**: início, painel, serviços, clientes, financeiro, documentos, usuários, configurações,
  ajuda, sair.
- **Ação/status**: busca, filtro, editar, excluir, imprimir, compartilhar, sino, download, atualizar,
  expandir.
- **Marca**: escudo (marinho, branco, dourado, chapado), monograma GS (3 cores), medalhão (512 e
  256 px), favicon 64 px.

## Reprodução

```bash
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow numpy
# fontes OFL em /tmp/fonts: Cinzel[wght].ttf -> Cinzel.ttf ; CormorantGaramond-Italic[wght].ttf -> CormorantItalic.ttf
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do /tmp/venv/bin/python scripts/imagens/lote-$n.py; done
/tmp/venv/bin/python scripts/imagens/preview.py   # regenera a galeria
```

Estrutura dos scripts: `scripts/imagens/comum.py` (logotipo, textos, gradientes, superfícies de
botão), `scripts/imagens/icones.py` (glifos e geração dos lotes de ícone) e um `lote-NN.py` por lote.
Fundos brutos de IA (sem texto nem logotipo) em `design/email/fundos/lote-01/`.
