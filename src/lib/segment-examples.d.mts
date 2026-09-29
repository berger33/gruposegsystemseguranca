export interface SegmentExample {
  /** Chave usada na rota `/segmentos/<key>` e no sitemap derivado. */
  key: string;
  name: string;
  /** Nome exato aceito pela API em `public_leads.property_type`. */
  propertyType: string;
  /** Pergunta de qualificação; não descreve promessa de serviço. */
  question: string;
}

export declare const SEGMENT_EXAMPLES: readonly SegmentExample[];
