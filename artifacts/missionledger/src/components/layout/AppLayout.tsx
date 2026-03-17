import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children, title }: { children: ReactNode, title?: string }) {
  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 md:px-8 sticky top-0 z-10 gap-4">
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
          {title && <h1 className="text-xl font-display font-semibold text-foreground">{title}</h1>}
        </header>
        <div className="p-4 md:p-8 flex-1 overflow-auto animate-fade-in">
          <div className="max-w-6xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
