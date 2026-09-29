import { PUBLIC_SERVICES, isPropertyType, isPublicService } from "./service-catalog.mjs";

const VALID_CHANNELS = new Set(["site", "whatsapp", "phone", "referral", "other"]);
// Apenas texto simples, sem HTML/markup: origem/campanha alimentam mensuração
// (PUB-10) e nunca devem carregar controle de layout.
const SAFE_TRACKING_RE = /^[\p{L}\p{N}\s\-_./:@]{1,100}$/u;

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
  if (!propertyType || !isPropertyType(propertyType)) return { error: "invalid_property_type" };
  if (details === null) return { error: "invalid_details" };
  if (visitPreference === null) return { error: "invalid_visit_preference" };
  if (!visitPreference && requestKind === "visit") return { error: "visit_preference_required" };
  if (requestKind === "visit" && visitPreference.length < 2) return { error: "visit_preference_required" };
  if (!services || services.length > PUBLIC_SERVICES.length || services.some(service => !isPublicService(service))) {
    return { error: "invalid_services" };
  }
  if (body?.consent !== true) return { error: "consent_required" };

  // PUB-03/CRM-05: origem, campanha, canal e e-mail são opcionais, mas quando
  // enviados precisam sobreviver à validação para aparecer no CRM depois da
  // conversão do lead (antes eram descartados aqui e chegavam sempre nulos,
  // mesmo quando o formulário público já os enviava).
  let origin = null;
  if (body?.origin !== undefined && body?.origin !== null && body?.origin !== "") {
    const raw = text(body.origin, 100);
    if (raw === null || !SAFE_TRACKING_RE.test(raw)) return { error: "invalid_origin" };
    origin = raw;
  }
  let campaign = null;
  if (body?.campaign !== undefined && body?.campaign !== null && body?.campaign !== "") {
    const raw = text(body.campaign, 100);
    if (raw === null || !SAFE_TRACKING_RE.test(raw)) return { error: "invalid_campaign" };
    campaign = raw;
  }
  let channel = "site";
  if (body?.channel !== undefined && body?.channel !== null && body?.channel !== "") {
    const raw = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
    if (!VALID_CHANNELS.has(raw)) return { error: "invalid_channel" };
    channel = raw;
  }
  let email = null;
  if (body?.email !== undefined && body?.email !== null && body?.email !== "") {
    const raw = text(body.email, 254);
    if (raw === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { error: "invalid_email" };
    email = raw.toLowerCase();
  }

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
      origin,
      campaign,
      channel,
      email,
    },
  };
}
