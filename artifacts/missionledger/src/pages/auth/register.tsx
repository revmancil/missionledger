import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function RegisterPage() {
  const { register, isRegistering } = useAuth();
  const [formData, setFormData] = useState({
    organizationName: "",
    ein: "",
    organizationType: "NONPROFIT",
    adminName: "",
    adminEmail: "",
    password: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ data: formData });
      toast.success("Registration successful!");
    } catch (err: any) {
      toast.error(err.message || "Failed to register");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <Card className="w-full max-w-xl relative z-10 shadow-2xl border-border bg-card animate-slide-up">
        <CardHeader className="text-center pb-6">
          <div className="w-12 h-12 bg-primary rounded-xl mx-auto flex items-center justify-center text-primary-foreground mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-display font-bold">Register Organization</CardTitle>
          <CardDescription>Setup your new MissionLedger account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Organization Name</label>
                <Input required value={formData.organizationName} onChange={e => setFormData(p => ({...p, organizationName: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">EIN</label>
                <Input required placeholder="XX-XXXXXXX" value={formData.ein} onChange={e => setFormData(p => ({...p, ein: e.target.value}))} />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium">Organization Type</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.organizationType}
                onChange={e => setFormData(p => ({...p, organizationType: e.target.value}))}
              >
                <option value="NONPROFIT">Nonprofit</option>
                <option value="CHURCH">Church</option>
                <option value="MEMBERSHIP">Membership Organization</option>
              </select>
            </div>

            <div className="border-t border-border pt-4 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Admin Name</label>
                <Input required value={formData.adminName} onChange={e => setFormData(p => ({...p, adminName: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Admin Email</label>
                <Input required type="email" value={formData.adminEmail} onChange={e => setFormData(p => ({...p, adminEmail: e.target.value}))} />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input required type="password" value={formData.password} onChange={e => setFormData(p => ({...p, password: e.target.value}))} />
            </div>

            <Button type="submit" className="w-full h-11 mt-4" disabled={isRegistering}>
              {isRegistering ? "Creating account..." : "Complete Registration"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already registered? <Link href="/login" className="text-primary font-medium hover:underline">Log in here</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
