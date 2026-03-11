import { redirect } from "next/navigation";
import {
  MOMENT_CHILD_TAGS,
  parseShareMomentFormData,
  validateShareMomentInput,
  type MomentChildTag,
  type MomentVisibility,
} from "@/lib/moment-engine";
import { requireAuth } from "@/lib/auth";
import { setCurrentFamilyId } from "@/lib/persistence/postgres/client";
import { db } from "@/lib/persistence";
import { FileUploadZone } from "./file-upload-zone";

type ShareMomentSearchParams = {
  title?: string;
  caption?: string;
  children?: string;
  visibility?: string;
  success?: string;
  error?: string;
  file?: string;
};

type ShareMomentPageState = {
  title: string;
  caption: string;
  childTag: MomentChildTag;
  visibility: MomentVisibility;
  errorMessage?: string;
  successMessage?: string;
  fileMessage?: string;
};

function isChildTag(value: string | undefined): value is MomentChildTag {
  return value === "none" || value === "leo" || value === "mia" || value === "both";
}

function isVisibility(value: string | undefined): value is MomentVisibility {
  return value === "shared" || value === "private";
}

function buildQueryStringFromInput(input: {
  title: string;
  caption: string;
  childTag: MomentChildTag;
  visibility: MomentVisibility;
}): string {
  const params = new URLSearchParams();
  if (input.title) {
    params.set("title", input.title);
  }
  if (input.caption) {
    params.set("caption", input.caption);
  }
  params.set("children", input.childTag);
  params.set("visibility", input.visibility);
  return params.toString();
}

function resolvePageState(searchParams: ShareMomentSearchParams | undefined): ShareMomentPageState {
  return {
    title: (searchParams?.title ?? "").trim(),
    caption: (searchParams?.caption ?? "").trim(),
    childTag: isChildTag(searchParams?.children) ? searchParams.children : "none",
    visibility: isVisibility(searchParams?.visibility) ? searchParams.visibility : "shared",
    errorMessage: searchParams?.error,
    successMessage: searchParams?.success === "1" ? "Moment shared successfully (demo mode)." : undefined,
    fileMessage:
      searchParams?.file === "1"
        ? "Media selected. Storage integration can be connected in the persistence layer next."
        : undefined,
  };
}

async function handleShareMoment(formData: FormData): Promise<void> {
  "use server";

  const input = parseShareMomentFormData(formData);
  const mediaUrl = (formData.get("mediaUrl") as string | null) ?? "";

  const baseParams = buildQueryStringFromInput({
    title: input.title,
    caption: input.caption,
    childTag: input.childTag,
    visibility: input.visibility,
  });

  // Validate core fields
  const validation = validateShareMomentInput(input);
  if (!validation.valid) {
    const params = new URLSearchParams(baseParams);
    params.set("error", validation.error ?? "Could not share this moment.");
    redirect(`/moments/share?${params.toString()}`);
  }

  // Validate media was uploaded
  if (!mediaUrl) {
    const params = new URLSearchParams(baseParams);
    params.set("error", "Please wait for the file upload to complete before sharing.");
    redirect(`/moments/share?${params.toString()}`);
  }

  // ─── Auth & Session ────────────────────────────────────────────────────────

  let session;
  try {
    session = await requireAuth();
  } catch (error) {
    const params = new URLSearchParams(baseParams);
    params.set("error", "You must be logged in to share a moment.");
    redirect(`/moments/share?${params.toString()}`);
  }

  const uploadedBy = session.userId;

  // Look up parent's family
  const parent = await db.parents.findByUserId(uploadedBy);
  if (!parent) {
    const params = new URLSearchParams(baseParams);
    params.set("error", "Could not find your family information. Please contact support.");
    redirect(`/moments/share?${params.toString()}`);
  }

  const familyId = parent.familyId;

  // ─── Create Moment ─────────────────────────────────────────────────────────

  try {
    // Set RLS context for family-scoped data isolation
    await setCurrentFamilyId(familyId);

    // Create moment in database
    await db.moments.create({
      familyId,
      uploadedBy,
      mediaUrl,
      // Persist a simplified media kind matching the DB contract ("photo" | "video").
      mediaType: input.mediaFileType?.startsWith("video/") ? "video" : "photo",
      title: input.title,
      caption: input.caption,
      childTag: input.childTag,
      visibility: input.visibility,
      thumbnailUrl: undefined, // No thumbnail generation for now
    });

    const success = new URLSearchParams(baseParams);
    success.set("success", "1");
    success.set("file", "1");
    redirect(`/moments/share?${success.toString()}`);
  } catch (error) {
    console.error("[Moments] Failed to create moment:", error);
    const params = new URLSearchParams(baseParams);
    params.set("error", "Could not save this moment. Please try again.");
    redirect(`/moments/share?${params.toString()}`);
  }
}

export default async function ShareMomentPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ShareMomentSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const state = resolvePageState(resolvedSearchParams);

  return (
    <main id="main-content" className="bg-background-light dark:bg-background-dark font-display antialiased text-text-main h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 h-full">
        <aside className="hidden lg:flex lg:w-5/12 relative bg-primary/20 items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-primary/20 mix-blend-multiply z-10"></div>
          <div
            className="absolute w-full h-full bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB2qbnKpG-L3elt6G4F38crsBEeLy_FKkttGPLFQ3zjLrnVcly8wdAkrSEtr0dwVxvMHuu_TV_9RsSdAbn7L7hCBlIqugdKXJqknMW2QHa8PuLJ_wPeHDuJP3Ow6_RjD41iy3qvi-UVmXfHnrqAOTbdCDRxO14GUdvybrCEq0GiN3PnqN407nHlCxUL9zYmJVd0r7oVkcHsGK38jEWUCOErOCqfrSVUt76TtsQn43Bx2Mnfi6SfRnKx73xXAY0wPxW8eAJGJfx-TqA')",
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-20"></div>

          <div className="relative z-30 p-12 text-white max-w-lg">
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                <span className="material-symbols-outlined text-3xl">family_restroom</span>
              </div>
              <span className="text-2xl font-bold tracking-tight">KidSchedule</span>
            </div>
            <h2 className="text-4xl font-bold mb-6 leading-tight">Preserve the small wins.</h2>
            <p className="text-xl text-white/90 leading-relaxed font-light">
              Shared moments help build a positive co-parenting history.
            </p>
            <div className="mt-12 flex items-center gap-4 text-sm text-white/80">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined">security</span>
                <span>Private &amp; Secure</span>
              </div>
              <div className="w-1 h-1 bg-white/50 rounded-full"></div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined">favorite</span>
                <span>Build Connection</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="w-full lg:w-7/12 flex flex-col h-full bg-surface-light dark:bg-surface-dark relative overflow-y-auto">
          <div className="lg:hidden p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-surface-light dark:bg-surface-dark z-20">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 flex items-center justify-center rounded-lg size-8 text-primary">
                <span className="material-symbols-outlined text-xl">family_restroom</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">KidSchedule</span>
            </div>
            <a className="text-slate-500 hover:text-slate-700" href="/dashboard" aria-label="Close">
              <span className="material-symbols-outlined">close</span>
            </a>
          </div>

          <div className="flex-1 p-6 sm:p-12 lg:px-20 lg:py-12 max-w-3xl mx-auto w-full">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Share a Family Moment</h1>
              <p className="text-slate-500 dark:text-slate-400">Upload photos or videos to keep everyone in the loop.</p>
            </div>

            {state.errorMessage && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300">
                {state.errorMessage}
              </div>
            )}

            {state.successMessage && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                {state.successMessage}
              </div>
            )}

            {state.fileMessage && (
              <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800/40 dark:bg-sky-900/10 dark:text-sky-300">
                {state.fileMessage}
              </div>
            )}

            <form action={handleShareMoment} className="space-y-8" method="post" encType="multipart/form-data">
              <FileUploadZone />

              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-white" htmlFor="title">
                    Moment Title
                  </label>
                  <div className="mt-2">
                    <input
                      className="block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary dark:bg-surface-dark dark:ring-slate-600 dark:text-white sm:text-sm sm:leading-6"
                      defaultValue={state.title}
                      id="title"
                      name="title"
                      placeholder="e.g., First Soccer Goal"
                      type="text"
                      required
                    />
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-white" htmlFor="caption">
                    Caption
                  </label>
                  <div className="mt-2">
                    <textarea
                      className="block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary dark:bg-surface-dark dark:ring-slate-600 dark:text-white sm:text-sm sm:leading-6"
                      defaultValue={state.caption}
                      id="caption"
                      name="caption"
                      placeholder="Share a little story about this moment..."
                      rows={3}
                    ></textarea>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-white" htmlFor="children">
                    Tag Children
                  </label>
                  <div className="mt-2">
                    <div className="relative">
                      <select
                        className="block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-primary dark:bg-surface-dark dark:ring-slate-600 dark:text-white sm:text-sm sm:leading-6 appearance-none"
                        defaultValue={state.childTag}
                        id="children"
                        name="children"
                      >
                        {MOMENT_CHILD_TAGS.map((child) => (
                          <option key={child.value} value={child.value}>
                            {child.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                        <span className="material-symbols-outlined text-lg">expand_more</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-white mb-3 block">Visibility</p>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      defaultChecked={state.visibility === "shared"}
                      className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                      id="visible-both"
                      name="visibility"
                      type="radio"
                      value="shared"
                    />
                    <label className="ml-3 block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200" htmlFor="visible-both">
                      <span className="block">Visible to both parents</span>
                      <span className="block text-xs font-normal text-slate-500">Great for keeping your co-parent involved.</span>
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      defaultChecked={state.visibility === "private"}
                      className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                      id="visible-private"
                      name="visibility"
                      type="radio"
                      value="private"
                    />
                    <label className="ml-3 block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200" htmlFor="visible-private">
                      <span className="block">Private (Just for me)</span>
                      <span className="block text-xs font-normal text-slate-500">Only visible in your personal memories.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
                <a
                  className="w-full sm:w-auto rounded-lg px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors text-center"
                  href="/dashboard"
                >
                  Cancel
                </a>
                <button
                  className="w-full sm:w-auto rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all duration-200"
                  type="submit"
                >
                  Share Moment
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
