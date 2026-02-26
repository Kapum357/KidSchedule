import { redirect } from "next/navigation";
import {
  MOMENT_CHILD_TAGS,
  parseShareMomentFormData,
  validateShareMomentInput,
  type MomentChildTag,
  type MomentVisibility,
} from "@/lib/moment-engine";

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
  const validation = validateShareMomentInput(input);

  const baseParams = buildQueryStringFromInput({
    title: input.title,
    caption: input.caption,
    childTag: input.childTag,
    visibility: input.visibility,
  });

  if (!validation.valid) {
    const params = new URLSearchParams(baseParams);
    params.set("error", validation.error ?? "Could not share this moment.");
    redirect(`/moments/share?${params.toString()}`);
  }

  const success = new URLSearchParams(baseParams);
  success.set("success", "1");
  if (input.mediaFileName) {
    success.set("file", "1");
  }

  // Future persistence wiring point:
  // - upload media file via provider adapter
  // - persist moment record through lib/persistence boundary
  // - emit moment_uploaded activity item
  redirect(`/moments/share?${success.toString()}`);
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
              <div className="group relative">
                <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-white mb-2" htmlFor="file-upload">
                  Upload Photos or Video
                </label>
                <div className="mt-2 flex justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-10 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer group-hover:border-primary">
                  <div className="text-center">
                    <span className="material-symbols-outlined mx-auto text-5xl text-slate-300 dark:text-slate-500 group-hover:text-primary transition-colors">cloud_upload</span>
                    <div className="mt-4 flex text-sm leading-6 text-slate-600 dark:text-slate-400 justify-center">
                      <label className="relative cursor-pointer rounded-md bg-transparent font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 hover:text-primary-hover" htmlFor="file-upload">
                        <span>Upload a file</span>
                        <input className="sr-only" id="file-upload" name="media" type="file" accept="image/png,image/jpeg,video/mp4" required />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-500">PNG, JPG, MP4 up to 50MB</p>
                  </div>
                </div>
              </div>

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
