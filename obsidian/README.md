# Como usar este vault

> Base de conhecimento em engenharia de software e arquitetura: 32 fichas atômicas costuradas por 6 hubs, desenhada para que o Graph View tenha forma legível — núcleo, satélites e pontes entre eixos.

## Instalar

1. Descompacte e copie os arquivos `.md` para dentro do seu vault do Obsidian
   (pode ficar numa subpasta, tipo `Conhecimento/Engenharia/`).
2. Abra o Obsidian e tecle `Ctrl/Cmd + G` para o **Graph View**.
3. Filtros úteis: `tag:#moc` mostra só a espinha; `tag:#ficha` mostra as folhas;
   um grupo por `area` colore cada eixo.

## Por que o grafo tem forma

- Cada nota é atômica (um conceito) e se conecta a poucas outras — o grafo é podado
  para manter densidade controlada, preservando as arestas semanticamente fortes.
- Os hubs (`MOC - ...`) formam um anel ligado ao índice: é o núcleo do desenho.
- As pontes que sobraram entre eixos (ex.: evento → outbox → consistência eventual)
  são exatamente o raciocínio que atravessa o conhecimento.

## Expandindo

- Edite os JSONs em `_spec/` (um arquivo por eixo) e rode:
  `python3 scripts/gerar_obsidian.py`
- Todo `[[link]]` é validado: apontar para nota inexistente faz o script parar.
- Ajuste o desenho com `--densidade` (padrão 0.17) e `--min-grau`.

## Mapa

- 32 fichas · 6 hubs · 125 arestas
- grau médio 6.41 · densidade 0.169
