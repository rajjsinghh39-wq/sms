"use client";

import { PanelLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebarCtx } from "./sidebar-context";

export function SidebarToggleButton() {
  const { toggle, setMobileOpen, collapsed } = useSidebarCtx();

  function handleClick() {
    // On mobile (< md) open the Sheet; on desktop collapse/expand
    if (window.innerWidth < 768) {
      setMobileOpen(true);
    } else {
      toggle();
    }
  }

  return (
    <button
      onClick={handleClick}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150"
      aria-label="Toggle sidebar"
    >
      {collapsed ? (
        <PanelLeftOpen size={18} strokeWidth={1.8} />
      ) : (
        <PanelLeftClose size={18} strokeWidth={1.8} />
      )}
    </button> 
  );
}
