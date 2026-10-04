import type { Metadata } from 'next';
import AdminGate from '../AdminGate';
import RhWorkspace from './RhWorkspace';

export const metadata: Metadata = {
  title: 'Funcionários e RH | SEG System',
  robots: { index: false, follow: false },
};

// F01: entrada de RH unificada — anônimo vai ao login central e retorna aqui;
// a Andreia (papel rh) chega direto do login. As permissões finas de RH
// (employees.read/write e restrições salariais) seguem decididas no servidor
// em cada /api/admin/hr/*; o gate apenas evita estrutura com erros para quem
// não deveria ver a área.
export default function AdminFuncionariosPage() {
  return (
    <AdminGate allowedRoles={['rh', 'marcelo', 'admin', 'ti']}>
      <RhWorkspace />
    </AdminGate>
  );
}
