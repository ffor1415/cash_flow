import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Wallet } from 'lucide-react';
import { z } from 'zod';

const signupSchema = z.object({
  username: z.string().min(3, 'At least 3 characters').max(20).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

const Signup = () => {
  const { signUp, user } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (user) return <Navigate to="/" replace />;

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = signupSchema.safeParse(form);
    if (!result.success) {
      const fe: Record<string, string> = {};
      result.error.errors.forEach(err => { if (err.path[0]) fe[err.path[0] as string] = err.message; });
      setErrors(fe);
      return;
    }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.username);
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success('Account created! Check your email to verify.');
  };

  return (
    <div
      className="min-h-dvh bg-background flex flex-col items-center justify-center overflow-x-hidden"
      style={{ padding: 'max(env(safe-area-inset-top,0px), 1.5rem) var(--page-px) max(env(safe-area-inset-bottom,0px), 1.5rem)' }}
    >
      <div className="w-full max-w-sm space-y-7 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Create Account</h1>
          <p className="text-muted-foreground text-sm">Start tracking your finances</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" placeholder="johndoe" value={form.username}
              onChange={e => handleChange('username', e.target.value)}
              className="bg-secondary border-border h-12" autoComplete="username" />
            {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              className="bg-secondary border-border h-12" autoComplete="email" />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => handleChange('password', e.target.value)}
                className="bg-secondary border-border pr-12 h-12" autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1 touch-min">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input id="confirmPassword" type="password" placeholder="••••••••"
              value={form.confirmPassword} onChange={e => handleChange('confirmPassword', e.target.value)}
              className="bg-secondary border-border h-12" autoComplete="new-password" />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
          </div>

          <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground font-semibold h-12 text-base">
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground pb-4">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">Sign In</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;