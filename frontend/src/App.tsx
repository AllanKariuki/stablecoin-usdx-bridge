import './App.css'
import { BrowserRouter as Router } from 'react-router-dom';
import NotificationContainer from './components/notifications/NotificationContainer';
import AppProvider from './components/routing/AppProvider';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { fetchMenuItems } from './redux/slices/navigation/sidebarSlice';
import DynamicRoutes from './routes/DynamicRoutes';
import useWebsocketNotifications from './hooks/useWebsocketNotifications';

function App() {
  const dispatch = useDispatch();
  
  // Initialize notifications system
  useWebsocketNotifications();
  
  useEffect(() => {
        dispatch(fetchMenuItems() as any);
    }, [dispatch]);
  return (
    <Router>
      <AppProvider>
        <DynamicRoutes />
        <NotificationContainer/>
      </AppProvider>
    </Router>
  )
}

export default App
