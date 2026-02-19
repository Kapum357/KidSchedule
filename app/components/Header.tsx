'use client';

export default function Header() {

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M7 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 1 0-2 0v1H9V3a1 1 0 0 0-1-1zm13 6H4v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">
            KidSchedule
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            Pricing
          </a>
          <a
            href="#about"
            className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            About
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button className="hidden sm:inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors">
            Log in
          </button>
          <button className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors">
            Sign Up
          </button>
        </div>
      </div>
    </header>
  );
}
