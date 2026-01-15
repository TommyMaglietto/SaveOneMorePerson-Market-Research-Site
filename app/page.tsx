import SwipeDeck from "@/components/SwipeDeck";

export default function Home() {
  return (
    <div className="min-h-screen bg-app px-[clamp(16px,3vw,32px)] pb-[clamp(32px,6vw,64px)] pt-[clamp(32px,6vw,48px)]">
      <main className="mx-auto flex w-full max-w-[400px] flex-col gap-[clamp(24px,4vw,40px)] min-[480px]:max-w-[500px] lg:max-w-[600px]">
        <header className="space-y-[clamp(12px,2vh,20px)] text-left">
          <h1 className="text-center font-heading leading-tight">
            <span
              className="block text-[clamp(22px,3vw,28px)] font-semibold text-[#6B89B0]"
              style={{ fontFamily: "Golden, Poppins, sans-serif" }}
            >
              Help Me
            </span>
            <span
              className="mt-1 block text-[clamp(38px,7vw,56px)] font-semibold tracking-wide text-[#FCD99A]"
              style={{ fontFamily: "Golden, Poppins, sans-serif" }}
            >
              Save One More Person
            </span>
          </h1>
          <p className="mx-auto max-w-[65ch] text-center text-[clamp(15px,1.8vw,17px)] leading-[1.6] text-[#6B89B0]">
            Help me save one more person by helping me decide what features are
            fellow Brothers and Sisters want in their bible app. We only store
            your choice, never emails, usernames, or device data.
          </p>
        </header>

        <SwipeDeck />
      </main>
    </div>
  );
}
