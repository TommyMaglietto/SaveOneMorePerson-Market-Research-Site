import SwipeDeck from "@/components/SwipeDeck";

export default function Home() {
  return (
    <div className="min-h-screen bg-app px-4 pb-16 pt-10">
      <main className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="space-y-4 text-left">
          <h1 className="text-center font-heading leading-tight">
            <span className="block text-2xl font-semibold text-[#6B89B0] font-rubik">
              Help Me
            </span>
            <span
              className="mt-1 block text-5xl font-semibold tracking-wide text-[#FCD99A]"
              style={{ fontFamily: "Golden, Poppins, sans-serif" }}
            >
              Save One More Person
            </span>
          </h1>
          <p className="text-center text-sm text-[#6B89B0]">
            Swipe through feature ideas and choose yes, maybe, or no. We only
            store your choice and never emails, usernames, or device data.
          </p>
        </header>

        <SwipeDeck />
      </main>
    </div>
  );
}
