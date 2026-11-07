import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { JudulDokumen } from '@/components/Merek';
import { Toaster } from '@/components/ui/sonner';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 15_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <JudulDokumen />
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
