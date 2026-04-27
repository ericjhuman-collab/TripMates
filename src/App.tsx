import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TripProvider } from './context/TripContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { Home } from './pages/Home';
import { Games } from './pages/Games';
import { Members } from './pages/Members';
import { Explore } from './pages/Explore';
import { DrunkLeaderboard } from './pages/DrunkLeaderboard';
import { JoinTripHandler } from './pages/JoinTripHandler';
import { Profile } from './pages/Profile';
import { GalleryCamera } from './pages/GalleryCamera';
import { Even } from './pages/Even';
import { EvenProvider } from './context/EvenContext';
import { OddsProvider } from './context/OddsContext';
import { TripAdmin } from './pages/TripAdmin';
import { ActivityEditorPage } from './pages/ActivityEditorPage';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <TripProvider>
          <EvenProvider>
            <OddsProvider>
            <div className="app-container">
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
                  </Route>
                  <Route path="/gallery" element={<GalleryCamera />} />
                  <Route path="/admin/:tripId" element={<TripAdmin />} />
                  <Route path="/admin/:tripId/activity/new" element={<ActivityEditorPage />} />
                  <Route path="/admin/:tripId/activity/:activityId" element={<ActivityEditorPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            </OddsProvider>
          </EvenProvider>
        </TripProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
