import test from "node:test";
import assert from "node:assert/strict";
import { validateLeadInput } from "../src/lib/public-lead-validation.mjs";

const validQuote = {
  requestKind: "quote",
  name: "  Ana Lima  ",
  phone: "(11) 99999-1234",
  city: " Guarulhos ",
  propertyType: "Condomínio",
  services: ["Segurança Desarmada"],
  details: "  Preciso de informações. ",
  consent: true,
};

test("normalizes a valid quote and keeps only allowed lead fields", () => {
  const result = validateLeadInput(validQuote);
  assert.deepEqual(result, {
    value: {
      requestKind: "quote",
      name: "Ana Lima",
      phone: "(11) 99999-1234",
      city: "Guarulhos",
      propertyType: "Condomínio",
      services: ["Segurança Desarmada"],
      visitPreference: null,
      details: "Preciso de informações.",
      origin: null,
      campaign: null,
      channel: "site",
      email: null,
    },
  });
});

test("PUB-03/CRM-05: keeps origin, campaign, channel and e-mail when sent", () => {
  const result = validateLeadInput({
    ...validQuote,
    origin: "contato",
    campaign: "outono-2026",
    channel: "whatsapp",
    email: "Ana.Lima@Exemplo.com",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.origin, "contato");
  assert.equal(result.value.campaign, "outono-2026");
  assert.equal(result.value.channel, "whatsapp");
  assert.equal(result.value.email, "ana.lima@exemplo.com");
});

test("rejects tracking fields that carry markup or unsupported values", async t => {
  const cases = [
    ["origin markup", { origin: "<script>alert(1)</script>" }, "invalid_origin"],
    ["campaign markup", { campaign: "<img src=x>" }, "invalid_campaign"],
    ["invalid channel", { channel: "carrier-pigeon" }, "invalid_channel"],
    ["invalid email", { email: "not-an-email" }, "invalid_email"],
  ];
  for (const [label, override, expected] of cases) {
    await t.test(label, () => {
      assert.deepEqual(validateLeadInput({ ...validQuote, ...override }), { error: expected });
    });
  }
});

test("allows a quote without selected services or optional details", () => {
  const result = validateLeadInput({ ...validQuote, services: [], details: "" });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.services, []);
  assert.equal(result.value.details, null);
});

test("accepts a visit request only with a meaningful preferred time", () => {
  const result = validateLeadInput({
    ...validQuote,
    requestKind: "visit",
    visitPreference: " Terça à tarde ",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.visitPreference, "Terça à tarde");
});

test("rejects malformed required fields and unsupported values", async t => {
  const cases = [
    ["request kind", { requestKind: "other" }, "invalid_request_kind"],
    ["name", { name: "A" }, "invalid_name"],
    ["name length", { name: "n".repeat(101) }, "invalid_name"],
    ["phone", { phone: "123" }, "invalid_phone"],
    ["city", { city: "x" }, "invalid_city"],
    ["property", { propertyType: "Casa" }, "invalid_property_type"],
    ["service", { services: ["Serviço inventado"] }, "invalid_services"],
    ["services type", { services: "Segurança Desarmada" }, "invalid_services"],
    ["consent", { consent: false }, "consent_required"],
    ["long details", { details: "d".repeat(1001) }, "invalid_details"],
    ["non-text details", { details: 123 }, "invalid_details"],
    ["long visit preference", { requestKind: "visit", visitPreference: "v".repeat(121) }, "invalid_visit_preference"],
    ["missing visit preference", { requestKind: "visit" }, "visit_preference_required"],
    ["short visit preference", { requestKind: "visit", visitPreference: "x" }, "visit_preference_required"],
  ];
  for (const [label, override, expected] of cases) {
    await t.test(label, () => {
      assert.deepEqual(validateLeadInput({ ...validQuote, ...override }), { error: expected });
    });
  }
});

test("deduplicates allowed service choices", () => {
  const result = validateLeadInput({
    ...validQuote,
    services: ["Câmeras e CFTV", "Câmeras e CFTV", "Supervisão e Ronda"],
  });
  assert.deepEqual(result.value.services, ["Câmeras e CFTV", "Supervisão e Ronda"]);
});
