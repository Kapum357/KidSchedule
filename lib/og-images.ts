import type { Metadata } from "next";

export type Audience = "family" | "coparent" | "team" | "pta";

interface OGImageConfig {
  title: string;
  description: string;
  imageWebp: string;
  imagePng: string;
}

export const OG_IMAGES: Record<Audience, OGImageConfig> = {
  family: {
    title: "KidSchedule – Co-parenting calendar made calm",
    description: "Shared custody schedules, expenses, and communication in one place.",
    imageWebp: "/og/family.webp",
    imagePng: "/og/family.png",
  },
  coparent: {
    title: "KidSchedule for Co-Parents",
    description: "Reduce friction with shared plans and transparent updates.",
    imageWebp: "/og/coparent.webp",
    imagePng: "/og/coparent.png",
  },
  team: {
    title: "KidSchedule for Care Teams",
    description: "Coordinate school, activities, and responsibilities with confidence.",
    imageWebp: "/og/team.webp",
    imagePng: "/og/team.png",
  },
  pta: {
    title: "KidSchedule PTA Portal",
    description: "Events, volunteer slots, and school coordination for modern families.",
    imageWebp: "/og/pta.webp",
    imagePng: "/og/pta.png",
  },
};

function buildMetadata(config: OGImageConfig): Metadata {
  return {
    title: config.title,
    description: config.description,
    openGraph: {
      title: config.title,
      description: config.description,
      images: [
        {
          url: config.imageWebp,
          width: 1200,
          height: 630,
          type: "image/webp",
        },
        {
          url: config.imagePng,
          width: 1200,
          height: 630,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: config.title,
      description: config.description,
      images: [config.imageWebp, config.imagePng],
    },
  };
}

export function generateDefaultMetadata(): Metadata {
  return buildMetadata(OG_IMAGES.family);
}

export function generateAudienceMetadata(audience: Audience): Metadata {
  return buildMetadata(OG_IMAGES[audience]);
}
