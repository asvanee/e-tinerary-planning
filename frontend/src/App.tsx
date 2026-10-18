import { BrowserRouter, Routes, Route } from "react-router-dom";
import Welcome from "./features/welcome/Welcome";
import Register from "./features/auth/register/register";
import ConfirmEmail from "./features/auth/confirmEmail/confirmEmail";
import Login from "./features/auth/login/login";
import Home from "./features/home/home";
import ProtectedRoute from "./system/auth/ProtectedRoute";
import CreateTrip from "./features/trip/create/createTrip";
import TripRecommendations from "./features/trip/recommendations/TripRecommendations";
import MyTrips from "./features/trip/myTrips/MyTrips";
import ItineraryEditor from "./features/trip/e-tinerary/editor/ItineraryEditor";
import TripDetail from "./features/trip/detail/TripDetail";
import AutoTrip from "./features/trip/e-tinerary/auto/auto";
import AdminLogin from "./admin/login/AdminLogin";
import AdminRoute from "./admin/AdminRoute";
import AdminLayout from "./admin/AdminLayout";
import AdminDashboard from "./admin/dashboard/AdminDashboard";
import ProvinceList from "./admin/provinces/ProvinceList";
import ProvinceReview from "./admin/provinces/ProvinceReview";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/register" element={<Register />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route path="/login" element={<Login />} />

        {/* หน้าที่ต้อง login ก่อนเข้าได้ */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route
          path="/trip/create"
          element={
            <ProtectedRoute>
              <CreateTrip />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip/:tripId/recommendations"
          element={
            <ProtectedRoute>
              <TripRecommendations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip/:tripId/editor"
          element={
            <ProtectedRoute>
              <ItineraryEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip/:tripId/detail"
          element={
            <ProtectedRoute>
              <TripDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips"
          element={
            <ProtectedRoute>
              <MyTrips />
            </ProtectedRoute>
          }
        />


          <Route
            path="/trip/:tripId/auto"
            element={<AutoTrip />}
          />

        <Route
          path="/trip/:tripId/edit"
          element={
            <ProtectedRoute>
              <CreateTrip />
            </ProtectedRoute>
  }
/>

        {/* Admin Panel (R5, D-24) — สิทธิ์ตรวจที่ backend ผ่าน AdminRoute */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/provinces"
          element={
            <AdminRoute>
              <AdminLayout>
                <ProvinceList />
              </AdminLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/provinces/:province"
          element={
            <AdminRoute>
              <AdminLayout>
                <ProvinceReview />
              </AdminLayout>
            </AdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}