export type ProductRef =
  | { kind: 'pack'; packId: string }
  | { kind: 'package'; offeringId: string; packageId: string }
  | { kind: 'store'; productId: string };

const PACKAGE_PATTERN = /^([\w$.-]+)\/([\w$.-]+)$/;

export function parseProductRef(raw: string | null | undefined): ProductRef | null {
  const ref = (raw ?? '').trim();
  if (!ref) return null;
  if (ref.startsWith('pack:')) {
    const packId = ref.slice(5);
    return packId ? { kind: 'pack', packId } : null;
  }
  const match = PACKAGE_PATTERN.exec(ref);
  if (match) return { kind: 'package', offeringId: match[1], packageId: match[2] };
  return { kind: 'store', productId: ref };
}

export const packRef = (packId: string) => `pack:${packId}`;

export const packageRef = (offeringId: string, packageId: string) =>
  `${offeringId}/${packageId}`;

export const isPackageRef = (raw: string | null | undefined) =>
  parseProductRef(raw)?.kind === 'package';
