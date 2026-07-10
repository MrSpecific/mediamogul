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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme
      accentColor="indigo"
      grayColor="slate"
      radius="medium"
      appearance="inherit"
    >
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth/:pathname" element={<AuthPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/add" element={<AddMediaPage />} />
              <Route path="/media/:id" element={<MediaDetailPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/lists/:id" element={<ListDetailPage />} />
              <Route path="/u/:username" element={<ProfilePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </Theme>
  </StrictMode>,
);
