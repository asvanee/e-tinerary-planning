import type { ReactNode } from "react";
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
import ProvinceImport from "./admin/imports/ProvinceImport";
import CategoryMapping from "./admin/categories/CategoryMapping";

// หน้าที่ต้อง login ก่อนเข้า
const USER_PAGES: [string, ReactNode][] = [
  ["/home", <Home />],
  ["/trip/create", <CreateTrip />],
  ["/trip/:tripId/recommendations", <TripRecommendations />],
  ["/trip/:tripId/editor", <ItineraryEditor />],
  ["/trip/:tripId/detail", <TripDetail />],
  ["/trips", <MyTrips />],
  ["/trip/:tripId/auto", <AutoTrip />],
  ["/trip/:tripId/edit", <CreateTrip />],
];

// หน้า admin — backend ตรวจสิทธิ์ผ่าน AdminRoute ทุกครั้ง
const ADMIN_PAGES: [string, ReactNode][] = [
  ["/admin", <AdminDashboard />],
  ["/admin/provinces", <ProvinceList />],
  ["/admin/provinces/:province", <ProvinceReview />],
  ["/admin/provinces/:province/import", <ProvinceImport />],
  ["/admin/categories", <CategoryMapping />],
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/register" element={<Register />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route path="/login" element={<Login />} />
        {USER_PAGES.map(([path, page]) => (
          <Route key={path} path={path} element={<ProtectedRoute>{page}</ProtectedRoute>} />
        ))}

        <Route path="/admin/login" element={<AdminLogin />} />
        {ADMIN_PAGES.map(([path, page]) => (
          <Route
            key={path}
            path={path}
            element={
              <AdminRoute>
                <AdminLayout>{page}</AdminLayout>
              </AdminRoute>
            }
          />
        ))}
      </Routes>
    </BrowserRouter>
  );
}
