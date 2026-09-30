import PublicationClient from '../publicacao/PublicationClient';
export const metadata={title:'Temas | SEG System',robots:{index:false,follow:false}};
export default function Page(){return <PublicationClient initialTab="temas"/>;}
