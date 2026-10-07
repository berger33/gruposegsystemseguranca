import {SiteVisualPreview} from '@/components/SiteVisualRenderer';
import {isSiteVisualId} from '@/lib/site-visuals';
export const metadata={title:'Comparação de layouts | Grupo SEG System',robots:{index:false,follow:false}};
export default async function Preview({searchParams}:{searchParams:Promise<{visual?:string}>}){const {visual}=await searchParams;return <SiteVisualPreview visual={isSiteVisualId(visual)?visual:'06'}/>;}
