import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Theo - Support",
  description: "Get help and support for the Theo Bible app.",
};

export default function TheoSupportPage() {
  return (
    <div className="min-h-screen bg-app px-[clamp(16px,3vw,32px)] pb-[clamp(32px,6vw,64px)] pt-[clamp(32px,6vw,48px)]">
      <main className="mx-auto flex w-full max-w-[600px] flex-col gap-[clamp(16px,3vw,24px)]">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9BA8B0]">
            Support
          </p>
          <h1 className="font-heading text-3xl font-semibold text-[#2E5B7A]">
            Theo
          </h1>
          <p className="mt-1 text-sm text-[#6B7A84]">
            Your companion for Scripture
          </p>
        </header>

        <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
          <h2 className="text-base font-semibold text-[#2E5B7A]">
            How Can We Help?
          </h2>
          <p>
            We want your experience with Theo to be seamless. If you are
            experiencing any issues or have questions about the app, we are here
            to help.
          </p>
        </section>

        <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
          <h2 className="text-base font-semibold text-[#2E5B7A]">
            Contact Us
          </h2>
          <p>
            For any support inquiries, feedback, or questions, please reach out
            to us directly:
          </p>
          <p>
            <a
              href="mailto:support@saveonemoreperson.com"
              className="font-semibold text-[#4A7B9D] underline underline-offset-2 transition hover:text-[#2E5B7A]"
            >
              support@saveonemoreperson.com
            </a>
          </p>
          <p>
            We aim to respond to all inquiries within 48 hours.
          </p>
        </section>

        <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
          <h2 className="text-base font-semibold text-[#2E5B7A]">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-[#4A7B9D]">
                What is Theo?
              </p>
              <p>
                Theo is a Bible app designed to help you engage with Scripture in
                a meaningful and accessible way. Whether you are new to the Bible
                or a lifelong reader, Theo is built to support your journey of
                faith.
              </p>
            </div>

            <div>
              <p className="font-semibold text-[#4A7B9D]">
                Is Theo free to use?
              </p>
              <p>
                Theo is free to download. Some features may be available through
                optional in-app purchases.
              </p>
            </div>

            <div>
              <p className="font-semibold text-[#4A7B9D]">
                How do I report a bug or issue?
              </p>
              <p>
                Please email us at{" "}
                <a
                  href="mailto:support@saveonemoreperson.com"
                  className="font-semibold text-[#4A7B9D] underline underline-offset-2 transition hover:text-[#2E5B7A]"
                >
                  support@saveonemoreperson.com
                </a>{" "}
                with a description of the issue, your device model, and iOS
                version. Screenshots are always helpful.
              </p>
            </div>

            <div>
              <p className="font-semibold text-[#4A7B9D]">
                How do I delete my account or data?
              </p>
              <p>
                You can request account deletion or data removal at any time by
                emailing{" "}
                <a
                  href="mailto:support@saveonemoreperson.com"
                  className="font-semibold text-[#4A7B9D] underline underline-offset-2 transition hover:text-[#2E5B7A]"
                >
                  support@saveonemoreperson.com
                </a>
                . We will process your request within 30 days.
              </p>
            </div>

            <div>
              <p className="font-semibold text-[#4A7B9D]">
                What devices are supported?
              </p>
              <p>
                Theo is available for iPhone and iPad running iOS 16.0 or later.
              </p>
            </div>
          </div>
        </section>

        <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
          <h2 className="text-base font-semibold text-[#2E5B7A]">
            Privacy
          </h2>
          <p>
            Your privacy matters to us. We are committed to protecting your
            personal information. For details on how we collect, use, and
            safeguard your data, please review our privacy practices or contact
            us with any questions.
          </p>
        </section>

        <footer className="text-center text-xs text-[#9BA8B0]">
          <p>Save One More Person</p>
          <p className="mt-1">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
