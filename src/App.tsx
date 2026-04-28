import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TripProvider } from './context/TripContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { JoinTripHandler } from './pages/JoinTripHandler';
import { EvenProvider } from './context/EvenContext';
import { OddsProvider } from './context/OddsContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ToastProvider } from './components/Toast';
import './App.css';

// Route-level code splitting — keeps the initial JS bundle small. Home is
// kept eager because it's the landing surface for an authed user.
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Games = lazy(() => import('./pages/Games').then(m => ({ default: m.Games })));
const Members = lazy(() => import('./pages/Members').then(m => ({ default: m.Members })));
const Explore = lazy(() => import('./pages/Explore').then(m => ({ default: m.Explore })));
const DrunkLeaderboard = lazy(() => import('./pages/DrunkLeaderboard').then(m => ({ default: m.DrunkLeaderboard })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const GalleryCamera = lazy(() => import('./pages/GalleryCamera').then(m => ({ default: m.GalleryCamera })));
const Even = lazy(() => import('./pages/Even').then(m => ({ default: m.Even })));
const TripAdmin = lazy(() => import('./pages/TripAdmin').then(m => ({ default: m.TripAdmin })));
const ActivityEditorPage = lazy(() => import('./pages/ActivityEditorPage').then(m => ({ default: m.ActivityEditorPage })));

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#1e3a5f', fontSize: '0.9rem', opacity: 0.6 }}>
      Loading…
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <TripProvider>
              <EvenProvider>
                <OddsProvider>
                <div className="app-container">
                <Suspense fallback={<RouteFallback />}>
                <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/join/:id" element={<JoinTripHandler />} />
                    <Route path="/games" element={<Games />} />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/members" element={<Members />} />
                    <Route path="/leaderboard" element={<DrunkLeaderboard />} />
                    <Route path="/even" element={<Even />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/profile/:uid" element={<Profile />} />
                    <Route path="/gallery" element={<GalleryCamera />} />
                  </Route>
                  <Route path="/admin/:tripId" element={<TripAdmin />} />
                  <Route path="/admin/:tripId/activity/new" element={<ActivityEditorPage />} />
                  <Route path="/admin/:tripId/activity/:activityId" element={<ActivityEditorPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
                </div>
                </OddsProvider>
              </EvenProvider>
            </TripProvider>
          </AuthProvider>
        </ToastProvider>
      </AppErrorBoundary>
    </Router>
  );
}

export default App;
