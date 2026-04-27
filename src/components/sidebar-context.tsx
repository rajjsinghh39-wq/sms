"use client";

import { createContext, useContext, useRef, useState } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";

type SidebarContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  panelRef: React.RefObject<ImperativePanelHandle> | null;
};

const SidebarCtx = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
  panelRef: null,
});

export function useSidebarCtx() {
  return useContext(SidebarCtx);
}

export function SidebarContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef<ImperativePanelHandle>(null);

  return (
    <SidebarCtx.Provider
      value={{
        collapsed,
        setCollapsed,
        toggle: () => {
          const panel = panelRef.current;
          if (panel) {
            if (panel.isCollapsed()) {
              panel.expand();
            } else {
              panel.collapse();
            }
          }
        },
        mobileOpen,
        setMobileOpen,
        panelRef,
      }}
    >
      {children}
    </SidebarCtx.Provider>
  );
}
