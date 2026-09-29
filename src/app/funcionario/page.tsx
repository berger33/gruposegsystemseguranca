import type { Metadata } from 'next';
import EmployeePortal from './EmployeePortal';

export const metadata: Metadata = {
  title: 'Portal do funcionário | SEG System',
  description: 'Acesso próprio do funcionário a perfil, escala, documentos e solicitações.',
  robots: { index: false, follow: false },
};

export default function FuncionarioPage() {
  return <EmployeePortal />;
}
