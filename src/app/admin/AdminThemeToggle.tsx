"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./AdminThemeToggle.module.css";

export const ADMIN_THEME_STORAGE_KEY = "segsystem.admin.appearance.v1";

type AdminTheme = "day" | "night";

function applyTheme(theme: AdminTheme) {
  if (theme === "night") {
    document.documentElement.dataset.adminTheme = "night";
  } else {
    delete document.documentElement.dataset.adminTheme;
  }
}

export default function AdminThemeToggle() {
  const [theme, setTheme] = useState<AdminTheme>("day");

  useEffect(() => {
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    } catch {
      // Sem armazenamento disponível, a preferência atual continua válida só nesta página.
    }
    const initialTheme: AdminTheme = storedTheme === "night" ? "night" : "day";
    applyTheme(initialTheme);
    setTheme(initialTheme);

    const syncTheme = (event: StorageEvent) => {
      if (event.key !== ADMIN_THEME_STORAGE_KEY && event.key !== null) return;
      const nextTheme: AdminTheme = event.newValue === "night" ? "night" : "day";
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: AdminTheme = theme === "night" ? "day" : "night";
    applyTheme(nextTheme);
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // A preferência continua funcionando nesta aba se o armazenamento estiver bloqueado.
    }
  };

  const isNight = theme === "night";
  const label = isNight ? "Modo dia" : "Modo noite";

  return (
    <button
      type="button"
      className={styles.toggle}
      data-admin-theme-toggle="true"
      onClick={toggleTheme}
      aria-label={`Ativar ${label.toLowerCase()}`}
      aria-pressed={isNight}
      title={`Ativar ${label.toLowerCase()}`}
    >
      {isNight ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
