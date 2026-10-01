---
titulo: Microsserviços
tipo: ficha
area: arquitetura
hub: [[MOC - Arquitetura de Software]]
tags:
  - ficha
  - area/arquitetura
  - arquitetura
  - distribuido
  - escala
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Microsserviços

> Serviços independentes, cada um com seu deploy e seu banco — você troca simplicidade local por autonomia de times e escala seletiva.

## Definição

- Microsserviços são um estilo arquitetural em que o sistema é decomposto em serviços pequenos, implantados de forma independente, donos do seu próprio estado e comunicando-se por rede.
- A autonomia é o produto que você compra: dois serviços podem evoluir, escalar e cair sem se arrastar mutuamente.

## Como funciona

- Cada serviço tem pipeline próprio, banco próprio e contrato de API versionado; a coordenação de escritas entre serviços passa a usar eventos ou sagas, não transação distribuída.
- O preço aparece em três lugares: latência de rede, depuração distribuída e consistência — o sistema passa a ter estados intermediários legítimos.

## Quando usar

- Quando o gargalo é organizacional: times se bloqueando no mesmo deploy, ou partes do sistema com cadência e escala radicalmente diferentes.
- Quando você já conhece as fronteiras do domínio — distribuir fronteiras erradas é multiplicar o custo do erro.

## Armadilhas

- Microsserviços prematuros: fronteira errada vira chamada de rede dentro de transação, e você paga juros compostos em latência e complexidade.
- Monólito distribuído: serviços que só compilam, testam e implantam juntos — todo o custo, nenhum benefício.
- Compartilhar banco entre serviços desfaz a única vantagem estrutural do estilo.

## Conexões

- [[Testes de Contrato]] — substitui o teste fim-a-fim que fica caro demais de manter

## Veja também

- [[MOC - Arquitetura de Software]]
