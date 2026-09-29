import type { Metadata } from 'next';
import RhWorkspace from './RhWorkspace';

export const metadata: Metadata = {
  title: 'Funcionários e RH | SEG System',
  robots: { index: false, follow: false },
};

export default function AdminFuncionariosPage() {
  return <RhWorkspace />;
}
