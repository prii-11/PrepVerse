// Central router definition: public landing/auth, protected app shell,
// and the dedicated interview room shell (replaces normal navigation).
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import AppShell from '../components/layout/AppShell';
import ProtectedRoute from './ProtectedRoute';
import LandingPage from '../pages/landing/LandingPage';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import Home from '../pages/Home';
import Practice from '../pages/Practice';
import Interviews from '../pages/Interviews';
import InterviewSetup from '../pages/interviews/InterviewSetup';
import InterviewRoom from '../pages/interviews/InterviewRoom';
import InterviewReport from '../pages/interviews/InterviewReport';
import Resume from '../pages/resumes/Resume';
import ResumeAnalysis from '../pages/resumes/ResumeAnalysis';
import Progress from '../pages/Progress';
import Profile from '../pages/Profile';
import NotFound from '../pages/NotFound';
import { ROUTES } from '../utils/constants';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path={ROUTES.landing} element={<LandingPage />} />

        <Route element={<AuthLayout />}>
          <Route path={ROUTES.login} element={<Login />} />
          <Route path={ROUTES.signup} element={<Signup />} />
        </Route>

        {/* Protected — single top-nav application shell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.practice} element={<Practice />} />
            <Route path={ROUTES.interviews} element={<Interviews />} />
            <Route path={ROUTES.interviewSetup} element={<InterviewSetup />} />
            <Route path="/interview/:id" element={<InterviewRoom />} />
            <Route path="/report/:id" element={<InterviewReport />} />
            <Route path={ROUTES.resume} element={<Resume />} />
            <Route path="/resume/:id" element={<ResumeAnalysis />} />
            <Route path={ROUTES.progress} element={<Progress />} />
            <Route path={ROUTES.profile} element={<Profile />} />
          </Route>
        </Route>

        {/* Legacy paths → canonical destinations */}
        <Route path="/dashboard" element={<Navigate to={ROUTES.home} replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
