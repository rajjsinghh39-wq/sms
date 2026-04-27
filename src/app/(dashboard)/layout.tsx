import Navbar from "@/components/Navbar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarContextProvider } from "@/components/sidebar-context";
import { SidebarToggleButton } from "@/components/sidebar-toggle-button";
import { DashboardResizableLayout } from "@/components/dashboard-resizable-layout";

import { cookies } from "next/headers";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const layout = cookieStore.get("react-resizable-panels:layout");
  let defaultLayout = undefined;
  if (layout) {
    try {
      defaultLayout = JSON.parse(layout.value);
    } catch (e) {}
  }

  return (
    <SidebarContextProvider>
      <DashboardResizableLayout 
        sidebar={<AppSidebar />}
        defaultLayout={defaultLayout}
      >
        <div className="h-full flex flex-col overflow-hidden">
          <div className="w-full flex items-center bg-background border-b border-border shrink-0">
            <SidebarToggleButton />
            <div className="flex-1">
              <Navbar />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F7F8FA] dark:bg-background">
            <main className="flex-1 overflow-y-auto custom-scrollbar">
              {children}
            </main>
          </div>
        </div>
      </DashboardResizableLayout>
    </SidebarContextProvider>
  );
}
