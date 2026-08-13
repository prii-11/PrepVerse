// Central router definition for the application pages and layouts.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import LandingPage from '../pages/landing/LandingPage';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import StudentProfile from '../pages/profile/StudentProfile';
import Dashboard from '../pages/dashboard/Dashboard';
import ResumeUpload from '../pages/resume/ResumeUpload';
import ResumeAnalysis from '../pages/resume/ResumeAnalysis';
import InterviewSetup from '../pages/interview/InterviewSetup';
import InterviewScreen from '../pages/interview/InterviewScreen';
import InterviewReport from '../pages/report/InterviewReport';
import PracticePlan from '../pages/practice/PracticePlan';
import Progress from '../pages/progress/Progress';
import NotFound from '../pages/NotFound';
import { ROUTES } from '../utils/constants';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />

        <Route element={<AuthLayout />}>
          <Route path={ROUTES.login} element={<Login />} />
          <Route path={ROUTES.signup} element={<Signup />} />
        </Route>

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path={ROUTES.profile} element={<StudentProfile />} />
            <Route path={ROUTES.dashboard} element={<Dashboard />} />
            <Route path={ROUTES.resumeUpload} element={<ResumeUpload />} />
            <Route path={ROUTES.resumeAnalysis} element={<ResumeAnalysis />} />
            <Route path={ROUTES.interviewSetup} element={<InterviewSetup />} />
            <Route path={ROUTES.interviewScreen} element={<InterviewScreen />} />
            <Route path={ROUTES.interviewReport} element={<InterviewReport />} />
            <Route path={ROUTES.practicePlan} element={<PracticePlan />} />
            <Route path={ROUTES.progress} element={<Progress />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
