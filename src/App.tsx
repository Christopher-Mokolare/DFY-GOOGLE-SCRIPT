import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { RequireAuth, RequireAdmin, RequireRunnerAccess } from './context/Guards'
import Layout from './components/layout/Layout'

import Home from './pages/Home'
import About from './pages/About'
import Contact from './pages/Contact'
import Terms from './pages/Terms'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import Activity from './pages/Activity'
import BrowseErrands from './pages/tasks/BrowseErrands'
import PostErrand from './pages/tasks/PostErrand'
import MyPostedTasks from './pages/tasks/MyPostedTasks'
import MyActiveTasks from './pages/tasks/MyActiveTasks'
import MyCompletedTasks from './pages/tasks/MyCompletedTasks'
import ActionRequired from './pages/tasks/ActionRequired'
import TaskChat from './pages/tasks/TaskChat'
import Messages from './pages/Messages'
import Notifications from './pages/Notifications'
import Profile from './pages/user/Profile'
import BankAccounts from './pages/user/BankAccounts'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminTasks from './pages/admin/AdminTasks'
import AdminPayments from './pages/admin/AdminPayments'
import AdminDisputes from './pages/admin/AdminDisputes'
import AdminAuditLog from './pages/admin/AdminAuditLog'
import { PaymentSuccess, PaymentCancelled } from './pages/PaymentPages'
import ManualPayment from './pages/ManualPayment'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/tasks/browse" element={<BrowseErrands />} />
              <Route path="/payments/success" element={<PaymentSuccess />} />
              <Route path="/tasks/payment" element={<RequireAuth><ManualPayment /></RequireAuth>} />
              <Route path="/payments/cancelled" element={<PaymentCancelled />} />

              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/activity" element={<RequireAuth><Activity /></RequireAuth>} />
              <Route path="/tasks/post" element={<RequireAuth><PostErrand /></RequireAuth>} />
              <Route path="/tasks/my-posted" element={<RequireAuth><MyPostedTasks /></RequireAuth>} />
              <Route path="/tasks/action-required" element={<RequireAuth><ActionRequired /></RequireAuth>} />
              <Route path="/tasks/my-active" element={<RequireRunnerAccess><MyActiveTasks /></RequireRunnerAccess>} />
              <Route path="/tasks/my-completed" element={<RequireAuth><MyCompletedTasks /></RequireAuth>} />
              <Route path="/tasks/:taskId/chat" element={<RequireAuth><TaskChat /></RequireAuth>} />
              <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
              <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
              <Route path="/user/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="/user/bank-accounts" element={<RequireAuth><BankAccounts /></RequireAuth>} />

              <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
              <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
              <Route path="/admin/tasks" element={<RequireAdmin><AdminTasks /></RequireAdmin>} />
              <Route path="/admin/payments" element={<RequireAdmin><AdminPayments /></RequireAdmin>} />
              <Route path="/admin/disputes" element={<RequireAdmin><AdminDisputes /></RequireAdmin>} />
              <Route path="/admin/audit-log" element={<RequireAdmin><AdminAuditLog /></RequireAdmin>} />

              <Route path="/browse-errands" element={<Navigate to="/tasks/browse" replace />} />
              <Route path="/post-errand" element={<Navigate to="/tasks/post" replace />} />
              <Route path="/profile" element={<Navigate to="/user/profile" replace />} />
              <Route path="/user-dashboard" element={<Navigate to="/dashboard" replace />} />
              <Route path="/payment-success" element={<Navigate to="/payments/success" replace />} />
              <Route path="/payment-cancelled" element={<Navigate to="/payments/cancelled" replace />} />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

              {/* The old wallet route is intentionally retired. */}
              <Route path="/wallet" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
