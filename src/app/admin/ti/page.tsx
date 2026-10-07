import AdminGate from '../AdminGate';
import TiConsole from './TiConsole';
export default function TiAdminPage(){return <AdminGate allowedRoles={['ti','admin']}><TiConsole/></AdminGate>;}
