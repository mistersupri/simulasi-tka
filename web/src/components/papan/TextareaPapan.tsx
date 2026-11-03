import { useEffect, useRef, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { adapterTeks } from './adapter';
import { usePapan } from './PapanKetik';

/** Area teks biasa yang ikut dilayani papan ketik layar (mis. jawaban yang diterima pada soal isian). */
export function TextareaPapan(props: ComponentProps<typeof Textarea>) {
  const papan = usePapan();
  const ref = useRef<HTMLTextAreaElement>(null);
  const daftarkan = papan?.daftarkan;
  useEffect(() => {
    const el = ref.current;
    if (!el || !daftarkan) return;
    return daftarkan(el, adapterTeks(el));
  }, [daftarkan]);
  return <Textarea ref={ref} {...props} />;
}
