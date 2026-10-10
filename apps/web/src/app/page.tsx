// Server component — no 'use client', no store import.
// The actual UI is entirely in AppShell (client component, ssr:false).
import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('../components/AppShell'), {
  ssr: false,
});

export default function Home() {
  return <AppShell />;
}
