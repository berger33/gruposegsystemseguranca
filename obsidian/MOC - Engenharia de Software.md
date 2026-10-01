---
titulo: MOC - Engenharia de Software
tipo: indice
tags:
  - moc
  - indice
status: ativo
atualizado: 2026-10-01
---

# MOC - Engenharia de Software

> Base de conhecimento em engenharia de software e arquitetura: 32 fichas atômicas costuradas por 6 hubs, desenhada para que o Graph View tenha forma legível — núcleo, satélites e pontes entre eixos.

## Eixos (hubs)

- [[MOC - Arquitetura de Software]] — Eixo das decisões de forma: até onde vai um deploy, onde ficam as fronteiras e como as partes conversam. É aqui que se escolhe o formato do sistema antes do código existir.
- [[MOC - Design de Código]] — Eixo da escala menor: como o código é organizado para que a próxima mudança seja barata. Arquitetura protege o sistema; design de código protege o dia a dia.
- [[MOC - Dados e Persistência]] — Eixo do estado: onde a verdade mora, como ela muda com segurança e o que acontece quando a escrita e a leitura precisam de formas diferentes.
- [[MOC - Domínio e Modelagem]] — Eixo do *o quê*: entender o problema antes da solução. É aqui que se descobre onde cortar o sistema — e toda decisão de arquitetura é consequência dessas fronteiras.
- [[MOC - Entrega e Operação]] — Eixo do caminho até produção: como a mudança viaja do commit até o usuário, com rapidez e a capacidade de voltar atrás.
- [[MOC - Testes e Qualidade]] — Eixo da confiança: o que você testa, onde testa e o quanto pode acreditar no verde. Teste é uma decisão de design tanto quanto de qualidade.

## Como navegar

- Comece pelo índice `MOC - Engenharia de Software` e escolha um eixo: cada hub lista suas fichas com uma frase-síntese.
- Dentro de uma ficha, a seção **Conexões** explica *por que* aquela nota aponta para a outra — é o raciocínio, não só o link.
- **Veja também** fecha o caminho de volta ao hub e às travessias laterais, evitando becos sem saída no grafo.
- No Graph View, use `tag:#moc` para enxergar a espinha e `tag:#ficha` para as folhas; grupos por `area` colorem os eixos.
- Sempre que criar uma nota nova, conecte-a a pelo menos 3 existentes: grau baixo é o que transforma grafo bonito em novelo.

## Saúde do grafo

- nós: 39 · fichas: 32 · hubs: 6 · arestas: 125
- grau médio: 6.41 · grau mínimo: 5 · densidade: 0.169
- mais conectadas: MOC - Dados e Persistência (12), MOC - Entrega e Operação (12), MOC - Arquitetura de Software (11), MOC - Design de Código (11), MOC - Domínio e Modelagem (11), MOC - Testes e Qualidade (11)
