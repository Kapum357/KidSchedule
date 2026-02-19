'use client';

interface UseCase {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: 'green' | 'blue' | 'orange' | 'purple';
  bgColor: string;
  textColor: string;
}

export default function UseCasesGrid() {
  const useCases: UseCase[] = [
    {
      id: 'busy-families',
      title: 'Busy Families',
      description:
        "Sync everyone's chaos in one shared view. Color-coded schedules for every family member.",
      icon: '👨‍👩‍👧‍👦',
      color: 'green',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      id: 'co-parents',
      title: 'Co-Parents',
      description:
        'Communication without conflict. Track expenses, shared custody days, and keep records secure.',
      icon: '👥',
      color: 'blue',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      id: 'teams-clubs',
      title: 'Teams & Clubs',
      description:
        'Never miss a practice again. Manage carpools, snack duties, and game schedules effortlessly.',
      icon: '⚽',
      color: 'orange',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
    },
    {
      id: 'ptas',
      title: 'PTAs',
      description:
        'Volunteers made easy. Coordinate fundraisers, events, and meetings without the email chain.',
      icon: '🏫',
      color: 'purple',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
  ];

  const colorClassMap = {
    green: 'hover:ring-emerald-500/50 border-t-emerald-500',
    blue: 'hover:ring-blue-500/50 border-t-blue-500',
    orange: 'hover:ring-orange-500/50 border-t-orange-500',
    purple: 'hover:ring-purple-500/50 border-t-purple-500',
  };

  const textColorMap = {
    green: 'text-emerald-600',
    blue: 'text-blue-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
  };

  return (
    <section className="bg-gray-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 md:text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-4">
            Built for how families really work
          </h2>
          <p className="text-lg text-gray-600">
            From co-parenting to soccer practice, we simplify the logistics so
            you can focus on raising great kids.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((useCase) => (
            <div
              key={useCase.id}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md hover:ring-opacity-50 ${
                colorClassMap[useCase.color]
              }`}
            >
              <div
                className={`absolute top-0 left-0 h-1.5 w-full ${
                  useCase.color === 'green'
                    ? 'bg-emerald-500'
                    : useCase.color === 'blue'
                      ? 'bg-blue-600'
                      : useCase.color === 'orange'
                        ? 'bg-orange-500'
                        : 'bg-purple-600'
                }`}
              />

              <div>
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${useCase.bgColor} text-3xl`}
                >
                  {useCase.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {useCase.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {useCase.description}
                </p>
              </div>

              <div className="mt-6 border-t border-gray-100 pt-4">
                <a
                  href="#"
                  className={`text-sm font-semibold ${textColorMap[useCase.color]} hover:underline`}
                >
                  Learn more →
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
