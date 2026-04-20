import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BottomNav } from './components/common/BottomNav';
import { HomePage } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { CatchesPage } from './pages/CatchesPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { useAppStore } from './store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export default function App() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app-layout">
          <div className="app-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/catches" element={<CatchesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
