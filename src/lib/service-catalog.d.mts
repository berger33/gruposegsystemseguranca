export interface CatalogService {
  /** Nome exato aceito pela API em `public_leads.services`. */
  name: string;
  short: string;
  /** Pergunta de qualificação; não descreve promessa de serviço. */
  question: string;
}

export interface CatalogPropertyType {
  /** Nome exato aceito pela API em `public_leads.property_type`. */
  name: string;
  question: string;
}

export interface RequestSummaryInput {
  kind: "quote" | "visit";
  name: string;
  phone: string;
  city: string;
  propertyType: string;
  services: string[];
  visitPreference: string;
  details: string;
}

export declare const PUBLIC_SERVICES: readonly CatalogService[];
export declare const PROPERTY_TYPES: readonly CatalogPropertyType[];

export declare function isPublicService(value: unknown): value is string;
export declare function isPropertyType(value: unknown): value is string;
export declare function findService(value: string): CatalogService | null;
export declare function findPropertyType(value: string): CatalogPropertyType | null;
export declare function buildRequestSummary(input: RequestSummaryInput): string[];
