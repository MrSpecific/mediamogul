import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Theme } from "@wlcr/base-ic";
import "@wlcr/base-ic/tokens";
import "@wlcr/base-ic/style.css";
import "./index.css";
import "./styles.css";
import { AuthProvider } from "./providers/AuthProvider";
import { AuthPage } from "./routes/AuthPage";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { AddMediaPage } from "./pages/AddMediaPage";
import { MediaDetailPage } from "./pages/MediaDetailPage";
import { ListsPage } from "./pages/ListsPage";
import { ListDetailPage } from "./pages/ListDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminGenresPage } from "./pages/AdminGenresPage";
import { SeriesPage } from "./pages/SeriesPage";
import { StatsPage } from "./pages/StatsPage";
import { AccountPage } from "./routes/AccountPage";
import { PublicMediaPage } from "./pages/PublicMediaPage";

// The app is dark-themed. Neon Auth's UI (Tailwind) keys its dark palette off a
// `.dark` ancestor, so ensure it's present on <html> regardless of the static
// index.html (also covers production and survives HMR of this module).
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme
      accentColor="yellow"
      grayColor="gray"
      radius="medium"
      scaling="100%"
      appearance="dark"
    >
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth/:pathname" element={<AuthPage />} />
            <Route path="/m/:id" element={<PublicMediaPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/add" element={<AddMediaPage />} />
              <Route path="/media/:id" element={<MediaDetailPage />} />
              <Route path="/series/:id" element={<SeriesPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/lists/:id" element={<ListDetailPage />} />
              <Route path="/u/:username" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account/:pathname" element={<AccountPage />} />
              <Route path="/admin/genres" element={<AdminGenresPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </Theme>
  </StrictMode>,
);
