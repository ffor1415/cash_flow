import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
    <p className="text-6xl mb-4">😕</p>
    <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Page not found</h1>
    <p className="text-muted-foreground mb-6">The page you're looking for doesn't exist.</p>
    <Link to="/" className="text-primary hover:underline font-medium">Go home</Link>
  </div>
);

export default NotFound;
