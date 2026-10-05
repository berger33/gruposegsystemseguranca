import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import styles from './UiCardLink.module.css';

export default function UiCardLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className={styles.card} data-ui-card-link="true">
      <span className={styles.title}>{label}<ArrowUpRight size={16} aria-hidden="true" /></span>
      <span className={styles.description}>{description}</span>
    </Link>
  );
}
