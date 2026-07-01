import { mutate as mutateGlobal } from 'swr';

export function mutateFriendsCaches() {
  mutateGlobal(
    (key) =>
      typeof key === 'string' &&
      (key.startsWith('/api/friends') || key.startsWith('/api/buddy')),
  );
}
