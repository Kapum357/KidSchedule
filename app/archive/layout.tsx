import type { ReactNode } from "react";

export default function ArchiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {/* Preload archive images for optimal performance */}
      <link
        rel="preload"
        as="image"
        href="/archive/family.png"
        type="image/png"
      />
      <link
        rel="preload"
        as="image"
        href="/archive/coparent.png"
        type="image/png"
      />
      <link
        rel="preload"
        as="image"
        href="/archive/pta.png"
        type="image/png"
      />
      <link
        rel="preload"
        as="image"
        href="/archive/team.png"
        type="image/png"
      />
      {children}
    </>
  );
}
