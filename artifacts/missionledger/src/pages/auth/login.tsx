import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Lock, Mail, Terminal } from "lucide-react";

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const [formData, setFormData] = useState({ companyCode: "", email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ data: formData });
      toast.success("Logged in successfully");
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
         <img src={`${import.meta.env.BASE_URL}images/hero-bg.png`} className="w-full h-full object-cover" alt="" />
      </div>
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl shadow-black/5 border-border/50 bg-card/95 backdrop-blur-xl animate-scale-in">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="w-12 h-12 bg-primary rounded-xl mx-auto flex items-center justify-center text-primary-foreground mb-2 shadow-lg shadow-primary/20">
            <Building2 className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-display font-bold">Welcome back</CardTitle>
          <CardDescription>Enter your details to access your ledger</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Company Code</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="e.g. HOPE-123" 
                  className="pl-9 h-11"
                  required
                  value={formData.companyCode}
                  onChange={(e) => setFormData(p => ({...p, companyCode: e.target.value}))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="email" 
                  placeholder="admin@example.org" 
                  className="pl-9 h-11"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(p => ({...p, email: e.target.value}))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  className="pl-9 h-11"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData(p => ({...p, password: e.target.value}))}
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base shadow-md" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account? <Link href="/register" className="text-primary font-medium hover:underline">Register your organization</Link>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <a
              href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/admin/login`}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Terminal className="h-3.5 w-3.5" />
              Admin Control Center
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
