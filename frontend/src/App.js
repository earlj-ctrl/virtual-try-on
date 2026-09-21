import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import CatalogPage from "@/pages/CatalogPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import TryOnPage from "@/pages/TryOnPage";
import OutfitBuilderPage from "@/pages/OutfitBuilderPage";
import WardrobePage from "@/pages/WardrobePage";
import ProfilePage from "@/pages/ProfilePage";
import AdminLayout, { AdminOverview } from "@/pages/admin/AdminLayout";
import AdminProducts from "@/pages/admin/AdminProducts";
import { AdminUsers, AdminAudit } from "@/pages/admin/AdminOther";
import AdminImport from "@/pages/admin/AdminImport";
import AdminExport from "@/pages/admin/AdminExport";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="App min-h-screen bg-background text-foreground">
            <Navbar />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/product/:id" element={<ProductDetailPage />} />
              <Route path="/try-on" element={<ProtectedRoute><TryOnPage /></ProtectedRoute>} />
              <Route path="/outfit-builder" element={<ProtectedRoute><OutfitBuilderPage /></ProtectedRoute>} />
              <Route path="/wardrobe" element={<ProtectedRoute><WardrobePage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminOverview />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="import" element={<AdminImport />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="export" element={<AdminExport />} />
              </Route>
            </Routes>
            <Toaster position="top-right" richColors />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
