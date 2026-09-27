const publicServices = new Set([
  "Segurança Desarmada",
  "Monitoramento 24 Horas",
  "Câmeras e CFTV",
  "Portaria e Controle de Acesso",
  "Limpeza e Conservação",
  "Supervisão e Ronda",
]);

const propertyTypes = new Set(["Condomínio", "Empresa ou comércio", "Indústria", "Instituição", "Outro"]);

export function validateLeadInput(body) {
  const text = (value, limit) => typeof value === "string" && value.trim().length <= limit ? value.trim() : null;
  const requestKind = body?.requestKind;
  const name = text(body?.name, 100);
  const phone = text(body?.phone, 30);
  const city = text(body?.city, 100);
  const propertyType = text(body?.propertyType, 80);
  const visitPreference = text(body?.visitPreference ?? "", 120);
  const details = text(body?.details ?? "", 1000);
  const services = Array.isArray(body?.services) ? [...new Set(body.services)] : null;
  if (!["quote", "visit"].includes(requestKind)) return { error: "invalid_request_kind" };
  if (!name || name.length < 2) return { error: "invalid_name" };
  if (!phone || phone.replace(/\D/g, "").length < 8 || phone.replace(/\D/g, "").length > 15) return { error: "invalid_phone" };
  if (!city || city.length < 2) return { error: "invalid_city" };
  if (!propertyType || !propertyTypes.has(propertyType)) return { error: "invalid_property_type" };
  if (details === null) return { error: "invalid_details" };
  if (visitPreference === null) return { error: "invalid_visit_preference" };
  if (!visitPreference && requestKind === "visit") return { error: "visit_preference_required" };
  if (requestKind === "visit" && visitPreference.length < 2) return { error: "visit_preference_required" };
  if (!services || services.length > publicServices.size || services.some(service => typeof service !== "string" || !publicServices.has(service))) {
    return { error: "invalid_services" };
  }
  if (body?.consent !== true) return { error: "consent_required" };
  return {
    value: {
      requestKind,
      name,
      phone,
      city,
      propertyType,
      services,
      visitPreference: requestKind === "visit" ? visitPreference : null,
      details: details || null,
    },
  };
}
