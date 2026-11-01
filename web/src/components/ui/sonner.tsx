import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: '!rounded-md !border !border-garis !bg-white !text-tinta !shadow-lg !font-sans !font-medium',
          error: '!bg-merah-muda',
          success: '!bg-hijau-muda',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
