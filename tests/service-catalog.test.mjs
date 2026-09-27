import test from "node:test";
import assert from "node:assert/strict";
import {
  PROPERTY_TYPES,
  PUBLIC_SERVICES,
  buildRequestSummary,
  findPropertyType,
  findService,
  isPropertyType,
  isPublicService,
} from "../src/lib/service-catalog.mjs";
import { validateLeadInput } from "../src/lib/public-lead-validation.mjs";

test("exposes the six services already published by the company", () => {
  assert.deepEqual(PUBLIC_SERVICES.map(service => service.name), [
    "Segurança Desarmada",
    "Monitoramento 24 Horas",
    "Câmeras e CFTV",
    "Portaria e Controle de Acesso",
    "Limpeza e Conservação",
    "Supervisão e Ronda",
  ]);
});

test("every catalog entry has copy and a qualifying question", () => {
  for (const service of PUBLIC_SERVICES) {
    assert.ok(service.short.length > 10, `${service.name} needs a description`);
    assert.ok(service.question.length > 10, `${service.name} needs a question`);
  }
  for (const property of PROPERTY_TYPES) {
    assert.ok(property.question.length > 10, `${property.name} needs a question`);
  }
});

test("the catalog never offers a value the API would reject", () => {
  // Regra central: o simulador e o servidor leem a mesma lista.
  for (const service of PUBLIC_SERVICES) {
    const result = validateLeadInput({
      requestKind: "quote",
      name: "Ana Lima",
      phone: "11999999999",
      city: "Guarulhos",
      propertyType: "Condomínio",
      services: [service.name],
      details: "",
      consent: true,
    });
    assert.equal(result.error, undefined, `${service.name} should be accepted`);
  }
  for (const property of PROPERTY_TYPES) {
    const result = validateLeadInput({
      requestKind: "quote",
      name: "Ana Lima",
      phone: "11999999999",
      city: "Guarulhos",
      propertyType: property.name,
      services: [],
      details: "",
      consent: true,
    });
    assert.equal(result.error, undefined, `${property.name} should be accepted`);
  }
});

test("recognizes only catalog values", () => {
  assert.equal(isPublicService("Monitoramento 24 Horas"), true);
  assert.equal(isPublicService("monitoramento 24 horas"), false);
  assert.equal(isPublicService("Vigilância Armada"), false);
  assert.equal(isPublicService(undefined), false);
  assert.equal(isPropertyType("Indústria"), true);
  assert.equal(isPropertyType("Casa"), false);
  assert.equal(findService("Câmeras e CFTV")?.name, "Câmeras e CFTV");
  assert.equal(findService("Inexistente"), null);
  assert.equal(findPropertyType("Outro")?.question.length > 0, true);
});

test("builds a readable summary for the WhatsApp handoff", () => {
  const lines = buildRequestSummary({
    kind: "visit",
    name: "Ana Lima",
    phone: "(11) 99999-1234",
    city: "Guarulhos",
    propertyType: "Condomínio",
    services: ["Monitoramento 24 Horas", "Câmeras e CFTV"],
    visitPreference: "Terça à tarde",
    details: "Duas entradas",
  });
  assert.equal(lines[0], "Olá! Gostaria de solicitar uma visita técnica ao Grupo SEG System.");
  assert.ok(lines.includes("Serviços de interesse: Monitoramento 24 Horas, Câmeras e CFTV"));
  assert.ok(lines.includes("Preferência de dia/turno: Terça à tarde"));
  assert.ok(lines.includes("Detalhes: Duas entradas"));
});

test("falls back to a request for guidance when no service is chosen", () => {
  const lines = buildRequestSummary({
    kind: "quote",
    name: "Ana Lima",
    phone: "11999999999",
    city: "Guarulhos",
    propertyType: "Empresa ou comércio",
    services: [],
    visitPreference: "",
    details: "",
  });
  assert.equal(lines[0], "Olá! Gostaria de solicitar um orçamento ao Grupo SEG System.");
  assert.ok(lines.includes("Serviços de interesse: Gostaria de orientação"));
  // Um pedido de orçamento não deve prometer preferência de visita.
  assert.ok(!lines.some(line => line.startsWith("Preferência de dia/turno")));
  assert.ok(!lines.some(line => line.startsWith("Detalhes")));
});

test("drops values outside the catalog instead of echoing them back", () => {
  const lines = buildRequestSummary({
    kind: "quote",
    name: "Ana Lima",
    phone: "11999999999",
    city: "Guarulhos",
    propertyType: "Condomínio",
    services: ["Monitoramento 24 Horas", "Vigilância Armada"],
    visitPreference: "",
    details: "",
  });
  assert.ok(lines.includes("Serviços de interesse: Monitoramento 24 Horas"));
});
