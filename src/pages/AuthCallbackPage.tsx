import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";

/**
 * Where an app sign-in link lands when the phone opens it in a browser instead of the app
 * (an email app's own browser, or a computer). The link still works: on a phone it is handed
 * to the app, on a computer it is shown as a QR code for the phone that asked for it.
 */
export function AuthCallbackPage() {
  const link = window.location.href;
  const onPhone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const valid = new URLSearchParams(window.location.search).has("oobCode");
  const openInApp = `dafadventures://auth-callback?link=${encodeURIComponent(link)}`;

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
          <Logo className="size-5 text-foreground" />
          <span className="text-sm font-semibold">Dalefy</span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          {!valid ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">This link is incomplete</h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">Open the sign-in email again and tap the button in it, or ask for a new link in the app.</p>
            </>
          ) : onPhone ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Finish signing in</h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">Your email app opened this in its browser. Open Dalefy to finish.</p>
              <Button render={<a href={openInApp} />} className="mt-6 h-11 w-full">Open the Dalefy app</Button>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">Asked on a different phone? Open the email on that phone instead. Links work once and expire after an hour.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Scan with your phone</h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">Point the camera of the phone you asked on at this code. It opens Dalefy and signs you in.</p>
              <div className="mt-8 inline-flex rounded-xl border border-border bg-white p-4 shadow-sm">
                <QRCodeSVG value={link} size={208} level="M" />
              </div>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">Links work once and expire after an hour. If it has expired, ask for a new one in the app.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
