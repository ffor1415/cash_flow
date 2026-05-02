import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Wallet } from 'lucide-react';

const Login = () => {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success('Welcome back!');
  };

  return (
    <div
      className="min-h-dvh bg-background flex flex-col items-center justify-center overflow-x-hidden"
      style={{ padding: 'max(env(safe-area-inset-top,0px), 1.5rem) var(--page-px) max(env(safe-area-inset-bottom,0px), 1.5rem)' }}
    >
      <div className="w-full max-w-sm space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
            <Wallet className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Cashes Flow</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage your finances</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email" type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="bg-secondary border-border h-12"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                className="bg-secondary border-border pr-12 h-12"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1 touch-min"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground font-semibold h-12 text-base">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground pb-4">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary hover:underline font-medium">Sign Up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;