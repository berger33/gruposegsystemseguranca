import styles from './BrandLogo.module.css';
/** Original supplied by the company; no redrawing, recoloring or distortion. */
export default function BrandLogo({size=48,alt='Grupo SEG System — Segurança Integrada'}:{size?:number;alt?:string}){
 return <img src="/brand/grupo-seg-system-original.jpg" alt={alt} width={size} height={size} className={styles.logo} style={{width:size,height:size}}/>;
}
