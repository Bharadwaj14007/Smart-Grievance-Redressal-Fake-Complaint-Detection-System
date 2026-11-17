import { Navigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
export function ProtectedRoute({ role, children }) {
    const session = useAppStore((state) => state.session);
    if (!session)
        return <Navigate to="/login" replace/>;
    if (session.role !== role)
        return <Navigate to="/unauthorized" replace/>;
    return children;
}
