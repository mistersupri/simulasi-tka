import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Info, ProfilSiswa, ProfilStaf } from '@/lib/tipe';

const tanpaUlang401 = (n: number, err: unknown) => !(err instanceof ApiError && err.status === 401) && n < 2;

export const useInfo = () =>
  useQuery({ queryKey: ['info'], queryFn: () => api.get<Info>('/info'), staleTime: 5 * 60_000 });

export const useProfilSiswa = () =>
  useQuery({
    queryKey: ['profil', 'siswa'],
    queryFn: () => api.get<{ profil: ProfilSiswa | null }>('/auth/saya?jenis=siswa').then((r) => r.profil),
    retry: tanpaUlang401,
  });

export const useProfilStaf = () =>
  useQuery({
    queryKey: ['profil', 'staf'],
    queryFn: () => api.get<{ profil: ProfilStaf | null }>('/auth/saya?jenis=staf').then((r) => r.profil),
    retry: tanpaUlang401,
  });
