"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { Palette } from "lucide-react";
import {
  DEFAULT_SITE_VISUAL,
  isSiteVisualId,
  SITE_VISUAL_STORAGE_KEY,
  type SiteVisualId,
} from "@/lib/site-visuals";
import styles from "./SiteVisualRenderer.module.css";

const Layout01 = dynamic(() => import("@/components/Layout01"));
const Layout02 = dynamic(() => import("@/components/Layout02"));
const Layout03 = dynamic(() => import("@/components/Layout03"));
const Layout04 = dynamic(() => import("@/components/Layout04"));
const Layout05 = dynamic(() => import("@/components/Layout05"));
const PublicSiteVisual = dynamic(() => import("@/components/PublicSite"));
const Layout07 = dynamic(() => import("@/components/Layout07"));
const Layout08 = dynamic(() => import("@/components/Layout08"));
const Layout09 = dynamic(() => import("@/components/Layout09"));
const Layout10 = dynamic(() => import("@/components/Layout10"));

const visualComponents: Record<SiteVisualId, ComponentType> = {
  "01": Layout01,
  "02": Layout02,
  "03": Layout03,
  "04": Layout04,
  "05": Layout05,
  "06": PublicSiteVisual,
  "07": Layout07,
  "08": Layout08,
  "09": Layout09,
  "10": Layout10,
};

function getStoredVisual(): SiteVisualId {
  try {
    const saved = window.localStorage.getItem(SITE_VISUAL_STORAGE_KEY);
    return isSiteVisualId(saved) ? saved : DEFAULT_SITE_VISUAL;
  } catch {
    return DEFAULT_SITE_VISUAL;
  }
}

export default function SiteVisualRenderer() {
  const [visualId, setVisualId] = useState<SiteVisualId>(DEFAULT_SITE_VISUAL);
  const centralSource = useRef(false);

  useEffect(() => {
    setVisualId(getStoredVisual());
    let disposed = false;
    const syncFromServer = async () => {
      try {
        const response = await fetch("/api/site-visual", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (disposed) return;
        if (response.ok && isSiteVisualId(data.visual)) {
          centralSource.current = true;
          setVisualId(data.visual);
        } else {
          centralSource.current = false;
          setVisualId(getStoredVisual());
        }
      } catch {
        if (!disposed) {
          centralSource.current = false;
          setVisualId(getStoredVisual());
        }
      }
    };
    void syncFromServer();
    const poll = window.setInterval(() => void syncFromServer(), 30_000);
    const updateFromStorage = (event: StorageEvent) => {
      if (!centralSource.current && event.key === SITE_VISUAL_STORAGE_KEY) {
        setVisualId(isSiteVisualId(event.newValue) ? event.newValue : DEFAULT_SITE_VISUAL);
      }
    };
    const updateFromSameTab = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (isSiteVisualId(detail)) setVisualId(detail);
    };
    window.addEventListener("storage", updateFromStorage);
    window.addEventListener("seg-site-visual-updated", updateFromSameTab);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.removeEventListener("storage", updateFromStorage);
      window.removeEventListener("seg-site-visual-updated", updateFromSameTab);
    };
  }, []);

  const SelectedVisual = visualComponents[visualId];
  return (
    <>
      <SelectedVisual />
      <a className={styles.appearanceShortcut} href="/admin/visual" aria-label="Abrir módulo de aparência do site">
        <Palette size={16} aria-hidden="true" />
        <span>Aparência</span>
      </a>
    </>
  );
}
