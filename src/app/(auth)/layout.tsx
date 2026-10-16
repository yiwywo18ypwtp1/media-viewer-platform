import { LocaleSwitcher } from "@/i18n/locale-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold tracking-wide text-neutral-500">Media Review Hub</p>
        <LocaleSwitcher />
      </div>
      {children}
    </main>
  );
}
