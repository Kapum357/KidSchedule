import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archive | KidSchedule",
  description: "Explore our previous designs and audience-focused materials",
};

type AudienceItem = {
  id: string;
  label: string;
  description: string;
  imagePath: string;
};

const audiences: AudienceItem[] = [
  {
    id: "family",
    label: "Family",
    description: "Supporting families in managing busy schedules and staying connected",
    imagePath: "/archive/family.png",
  },
  {
    id: "coparent",
    label: "Co-parent",
    description: "Tools designed for respectful and organized co-parenting coordination",
    imagePath: "/archive/coparent.png",
  },
  {
    id: "pta",
    label: "PTA",
    description: "Helping school parent-teacher associations communicate and organize events",
    imagePath: "/archive/pta.png",
  },
  {
    id: "team",
    label: "Team",
    description: "Collaboration features for extended family and support networks",
    imagePath: "/archive/team.png",
  },
];

export default function ArchivePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Archive</h1>
              <p className="mt-2 text-gray-600">
                Historical designs and audience-focused materials
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined mr-2 text-lg">
                arrow_back
              </span>
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {audiences.map((audience) => (
            <article
              key={audience.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Image Container */}
              <div className="relative h-64 bg-gray-100">
                <Image
                  src={audience.imagePath}
                  alt={`${audience.label} audience design`}
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-center mb-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {audience.label}
                  </span>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  {audience.description}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* Info Section */}
        <section className="mt-16 bg-white rounded-lg shadow-md p-8">
          <div className="flex items-start space-x-4">
            <span className="material-symbols-outlined text-blue-600 text-3xl mt-1">
              info
            </span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                About This Archive
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                This archive preserves historical designs and audience-focused materials 
                that reflect the evolution of KidSchedule&apos;s platform. These materials 
                showcase how we&apos;ve adapted our approach to serve different user groups 
                over time.
              </p>
              <p className="text-gray-600 text-sm">
                For current features and documentation, visit our{" "}
                <Link href="/blog" className="text-blue-600 hover:text-blue-800 underline">
                  blog
                </Link>
                {" "}or explore the{" "}
                <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
                  dashboard
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
