import {SiteVisualPreview} from '@/components/SiteVisualRenderer';
import SitePreviewNotice from '@/components/SitePreviewNotice';
import {isSiteVisualId} from '@/lib/site-visuals';
export const metadata={title:'Comparação de layouts | Grupo SEG System',robots:{index:false,follow:false}};
export default async function Preview({searchParams}:{searchParams:Promise<{visual?:string}>}){const {visual}=await searchParams;const valid=isSiteVisualId(visual);const shown=valid?visual:'06';return <><SitePreviewNotice visual={shown} invalidRequested={visual!==undefined&&!valid}/><SiteVisualPreview visual={shown}/></>;}
