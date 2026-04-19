import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign In | VerifyMyProvider',
  description: 'Sign in to save your favorite providers',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginForm />;
}
