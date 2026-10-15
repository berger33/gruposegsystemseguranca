# Corrida rejeitada — host do servidor em Asia/Tokyo

Corrida de 2026-10-15 feita com `TZ=Asia/Tokyo` no processo do gate (que é o
mesmo processo que sobe o servidor da aplicação). Resultado: **36/44**, 8
reprovações (casos 35–41 e 44), exit 1. Não foi aceita como corrida final.

## Diagnóstico (defeito anterior a esta fatia, fora do escopo autorizado)

O servidor entrega as 17 colunas `DATE` como instante da meia-noite **local** do
processo (`pg` → `Date`), e compara/data com `.toISOString().slice(0,10)`
(`src/server/fin-advanced-api.mjs:761`, arquivo intocado por esta fatia). Com o
host a leste de Greenwich o dia de calendário anda um dia para trás:

```
TZ=Asia/Tokyo node -e "console.log(new Date(2038,0,10).toISOString().slice(0,10))"  # 2038-01-09
TZ=UTC        node -e "console.log(new Date(2038,0,10).toISOString().slice(0,10))"  # 2038-01-10
```

Reprovações observadas, todas com a mesma causa raiz: `due_date_mismatch` na
criação do aging (caso 35); `16/02/2038` onde o dado é `2038-02-17` (caso 37);
`28/02/2038 a 30/03/2038` onde o dado é `2038-03-01 a 2038-03-31` (casos 38-41);
lista de transações vinda vazia (caso 40), porque a gravação sintética de datas
também foi recusada pelo mesmo motivo.

A correção exigiria mudar payload/comportamento do servidor — o que esta fatia
não está autorizada a fazer. Registrar como achado transversal para decisão do
dono (ver limitações do relatório).

## O que ESTA corrida prova, apesar da rejeição

Os casos 42 (ausência declarada e formato inesperado cru) e 43 (o MESMO carimbo
em dois fusos de navegador, America/Sao_Paulo e Asia/Tokyo) passaram **mesmo com
o host em Tóquio**: a formatação de carimbo e a declaração de fuso não dependem
da máquina — que é exatamente a promessa desta fatia.

## Consequência para as corridas finais

As duas corridas finais rodam no host UTC, que é o ambiente do gate herdado e do
CI (`.github/workflows/ux-pro-07f1-delivery.yml`, ubuntu-latest), e a suposição
implícita do servidor. Arquivos desta corrida: `gate.txt` e as capturas.
