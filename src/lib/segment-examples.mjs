import { PROPERTY_TYPES } from "./service-catalog.mjs";

// Exemplos de contextos para qualificação; não são contratos, cobertura ou planos aprovados.
//
// PUB-08: este arquivo passou de `.ts` para `.mjs` (com `.d.mts` ao lado, mesmo
// padrão de `service-catalog.mjs`) porque `server.mjs` precisa das mesmas
// chaves para derivar o sitemap e não consegue importar TypeScript. O conteúdo
// é idêntico ao anterior — continua havendo UMA fonte para as páginas de
// segmento e para o mapa do site.
const examples = [
  { key: "condominios_residenciais", name: "Condomínios", propertyType: "Condomínio" },
  { key: "empresas_escritorios", name: "Empresas e comércios", propertyType: "Empresa ou comércio" },
  { key: "industrias_galpoes", name: "Indústrias", propertyType: "Indústria" },
];

export const SEGMENT_EXAMPLES = examples.map((example) => ({
  ...example,
  question: PROPERTY_TYPES.find((item) => item.name === example.propertyType)?.question ?? "Conte-nos sobre seu espaço.",
}));
