import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: '!rounded-md !border-2 !border-tinta !bg-white !text-tinta !shadow-[2px_2px_0_0_var(--tinta)] !font-sans !font-semibold',
          error: '!bg-bata-muda',
          success: '!bg-daun-muda',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
