import { BrowserRouter, Routes, Route } from "react-router-dom";
import Welcome from "./features/welcome/Welcome";
import Register from "./features/auth/register/register";
import ConfirmEmail from "./features/auth/confirmEmail/confirmEmail";
import Login from "./features/auth/login/login";
import Home from "./features/home/home";
import ProtectedRoute from "./features/auth/components/ProtectedRoute";
import CreateTrip from "./features/trip/create/createTrip";
import TripRecommendations from "./features/trip/recommendations/TripRecommendations";
import SelectedPlacesMap from "./features/trip/recommendations/SelectedPlacesMap";
import MyTrips from "./features/trip/myTrips/MyTrips";
import ScheduleTrip from "./features/trip/schedule/ScheduleTrip";

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
  path="/trip/:tripId/map"
  element={
    <ProtectedRoute>
      <SelectedPlacesMap />
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
  path="/trip/:tripId/schedule"
  element={
    <ProtectedRoute>
      <ScheduleTrip />
    </ProtectedRoute>
  }
/>
      </Routes>
    </BrowserRouter>
  );
}