import { PROPERTY_TYPES } from "./service-catalog.mjs";

// Exemplos de contextos para qualificação; não são contratos, cobertura ou planos aprovados.
const examples = [
  { key: "condominios_residenciais", name: "Condomínios", propertyType: "Condomínio" },
  { key: "empresas_escritorios", name: "Empresas e comércios", propertyType: "Empresa ou comércio" },
  { key: "industrias_galpoes", name: "Indústrias", propertyType: "Indústria" },
] as const;

export const SEGMENT_EXAMPLES = examples.map((example) => ({
  ...example,
  question: PROPERTY_TYPES.find((item) => item.name === example.propertyType)?.question ?? "Conte-nos sobre seu espaço.",
}));
