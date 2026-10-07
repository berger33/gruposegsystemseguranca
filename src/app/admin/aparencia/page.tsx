import AdminGate from '../AdminGate';
import AppearanceGallery from '@/components/AppearanceGallery';
export default function AppearancePage(){return <AdminGate allowedRoles={['admin','marcelo','ti']}><AppearanceGallery/></AdminGate>;}
